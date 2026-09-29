import {
  Timestamp,
  collection,
  doc,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  planAdjust,
  planDiscardFood,
  planDiscardLot,
  planFifo,
} from "../../shared/inventory.js";
import { computeConsumptionProfile } from "../../shared/consumption.js";
import { roundQty } from "../../shared/qty.js";
import type {
  Allocation,
  EventType,
  FoodItem,
  InventoryEvent,
  InventoryLot,
  SourceType,
} from "../../shared/types.js";

/**
 * InventoryEvent が Source of Truth。ここでは:
 *  - FoodItem / Lot には数量を書かない
 *  - イベントは create のみ(update / delete しない)
 *  - 書込みごとに consumptionProfiles/{foodItemId}(派生データ)を再計算して set
 * すべて 1 つの writeBatch で原子的にコミットする。
 */

function userCol(uid: string, name: string) {
  return collection(db, "users", uid, name);
}

export interface WriteContext {
  uid: string;
  /** 対象食材の全 Lot / 全イベント(現在の購読状態)。 */
  lots: readonly InventoryLot[];
  events: readonly InventoryEvent[];
}

interface DraftEvent {
  lotRef: DocumentReference;
  lotId: string;
  event_type: EventType;
  quantity_delta: number;
  occurred_at: Date;
  source_type?: SourceType;
}

function assertPositive(n: number, label: string): number {
  const q = roundQty(n);
  if (!Number.isFinite(q) || q <= 0) throw new Error(`invalid_${label}`);
  return q;
}

async function commit(
  uid: string,
  foodItemId: string,
  existingEvents: readonly InventoryEvent[],
  newLots: { ref: DocumentReference; purchased_at: Date; now: Date }[],
  drafts: DraftEvent[],
  now: Date,
): Promise<void> {
  const batch = writeBatch(db);
  const nowTs = Timestamp.fromDate(now);

  for (const l of newLots) {
    batch.set(l.ref, {
      food_item_id: foodItemId,
      purchased_at: Timestamp.fromDate(l.purchased_at),
      created_at: nowTs,
      updated_at: nowTs,
    });
  }

  const created: InventoryEvent[] = [];
  for (const d of drafts) {
    const ref = doc(userCol(uid, "inventoryEvents"));
    const sourceType = d.source_type ?? "MANUAL";
    batch.set(ref, {
      inventory_lot_id: d.lotId,
      food_item_id: foodItemId,
      event_type: d.event_type,
      quantity_delta: d.quantity_delta,
      source_type: sourceType,
      source_id: null,
      occurred_at: Timestamp.fromDate(d.occurred_at),
      created_at: nowTs,
    });
    created.push({
      id: ref.id,
      inventory_lot_id: d.lotId,
      food_item_id: foodItemId,
      event_type: d.event_type,
      quantity_delta: d.quantity_delta,
      source_type: sourceType,
      source_id: null,
      occurred_at: d.occurred_at,
      created_at: now,
    });
  }

  const profile = computeConsumptionProfile(
    [
      ...existingEvents.filter((e) => e.food_item_id === foodItemId),
      ...created,
    ],
    now,
  );
  batch.set(doc(userCol(uid, "consumptionProfiles"), foodItemId), {
    consumption_rate: profile.consumption_rate,
    observation_count: profile.observation_count,
    confidence_score: profile.confidence_score,
    calculated_at: nowTs,
  });

  await batch.commit();
}

function lotRefFor(uid: string, id: string) {
  return doc(userCol(uid, "inventoryLots"), id);
}

/** 食材を作成する。base_unit は以後変更不可。 */
export async function createFoodItem(
  uid: string,
  input: { name: string; base_unit: string },
): Promise<string> {
  const name = input.name.trim();
  const unit = input.base_unit.trim();
  if (!name) throw new Error("invalid_name");
  if (!unit) throw new Error("invalid_unit");
  const ref = doc(userCol(uid, "foodItems"));
  const now = Timestamp.now();
  const batch = writeBatch(db);
  batch.set(ref, {
    name,
    base_unit: unit,
    created_at: now,
    updated_at: now,
  });
  await batch.commit();
  return ref.id;
}

/** 購入日(日付)から purchased_at を決める。今日なら現在時刻、過去日は正午。 */
export function purchasedAtFor(date: Date, now: Date): Date {
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return now;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** 在庫追加: 新規 Lot + PURCHASE(MANUAL)。 */
export async function addStock(
  ctx: WriteContext,
  food: FoodItem,
  quantity: number,
  purchaseDate: Date,
): Promise<void> {
  const q = assertPositive(quantity, "quantity");
  const now = new Date();
  const purchasedAt = purchasedAtFor(purchaseDate, now);
  const ref = doc(userCol(ctx.uid, "inventoryLots"));
  await commit(
    ctx.uid,
    food.id,
    ctx.events,
    [{ ref, purchased_at: purchasedAt, now }],
    [
      {
        lotRef: ref,
        lotId: ref.id,
        event_type: "PURCHASE",
        quantity_delta: q,
        occurred_at: purchasedAt,
      },
    ],
    now,
  );
}

function allocationsToDrafts(
  uid: string,
  allocations: readonly Allocation[],
  type: EventType,
  at: Date,
): DraftEvent[] {
  return allocations.map((a) => ({
    lotRef: lotRefFor(uid, a.lotId),
    lotId: a.lotId,
    event_type: type,
    quantity_delta: a.delta,
    occurred_at: at,
  }));
}

/** 手動消費: FIFO で CONSUME(MANUAL)。不足分は記録せず shortage を返す。 */
export async function consumeManual(
  ctx: WriteContext,
  food: FoodItem,
  amount: number,
): Promise<{ shortage: number }> {
  const q = assertPositive(amount, "quantity");
  const foodLots = ctx.lots.filter((l) => l.food_item_id === food.id);
  const foodEvents = ctx.events.filter((e) => e.food_item_id === food.id);
  const plan = planFifo(foodLots, foodEvents, q);
  if (plan.allocations.length === 0) throw new Error("no_stock");
  const now = new Date();
  await commit(
    ctx.uid,
    food.id,
    ctx.events,
    [],
    allocationsToDrafts(ctx.uid, plan.allocations, "CONSUME", now),
    now,
  );
  return { shortage: plan.shortage };
}

/** 在庫補正: 「今実際にいくつあるか」から差分の ADJUST を作る。 */
export async function adjustStock(
  ctx: WriteContext,
  food: FoodItem,
  actualTotal: number,
): Promise<{ diff: number }> {
  if (!Number.isFinite(actualTotal) || actualTotal < 0) {
    throw new Error("invalid_quantity");
  }
  const foodLots = ctx.lots.filter((l) => l.food_item_id === food.id);
  const foodEvents = ctx.events.filter((e) => e.food_item_id === food.id);
  const plan = planAdjust(foodLots, foodEvents, actualTotal);
  if (plan.diff === 0) return { diff: 0 };

  const now = new Date();
  const drafts = allocationsToDrafts(ctx.uid, plan.allocations, "ADJUST", now);
  const newLots: { ref: DocumentReference; purchased_at: Date; now: Date }[] =
    [];
  if (plan.newLotDelta !== null) {
    // 加算先の Lot が無い: 新規 Lot を作り、その Lot に ADJUST を付ける(PURCHASE は作らない)。
    const ref = doc(userCol(ctx.uid, "inventoryLots"));
    newLots.push({ ref, purchased_at: now, now });
    drafts.push({
      lotRef: ref,
      lotId: ref.id,
      event_type: "ADJUST",
      quantity_delta: plan.newLotDelta,
      occurred_at: now,
    });
  }
  await commit(ctx.uid, food.id, ctx.events, newLots, drafts, now);
  return { diff: plan.diff };
}

/** Lot 指定の廃棄(量省略で残量全部)。 */
export async function discardLot(
  ctx: WriteContext,
  food: FoodItem,
  lotId: string,
  amount?: number,
): Promise<void> {
  const q =
    amount === undefined ? undefined : assertPositive(amount, "quantity");
  const foodEvents = ctx.events.filter((e) => e.food_item_id === food.id);
  const allocations = planDiscardLot(foodEvents, lotId, q);
  if (allocations.length === 0) throw new Error("no_stock");
  const now = new Date();
  await commit(
    ctx.uid,
    food.id,
    ctx.events,
    [],
    allocationsToDrafts(ctx.uid, allocations, "DISCARD", now),
    now,
  );
}

/** 食材指定の廃棄(FIFO)。不足分は記録せず shortage を返す。 */
export async function discardFifo(
  ctx: WriteContext,
  food: FoodItem,
  amount: number,
): Promise<{ shortage: number }> {
  const q = assertPositive(amount, "quantity");
  const foodLots = ctx.lots.filter((l) => l.food_item_id === food.id);
  const foodEvents = ctx.events.filter((e) => e.food_item_id === food.id);
  const plan = planDiscardFood(foodLots, foodEvents, q);
  if (plan.allocations.length === 0) throw new Error("no_stock");
  const now = new Date();
  await commit(
    ctx.uid,
    food.id,
    ctx.events,
    [],
    allocationsToDrafts(ctx.uid, plan.allocations, "DISCARD", now),
    now,
  );
  return { shortage: plan.shortage };
}
