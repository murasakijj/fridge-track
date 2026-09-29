import { z } from "zod";
import { planFifo } from "../../../shared/inventory.js";
import { computeConsumptionProfile } from "../../../shared/consumption.js";
import { roundQty } from "../../../shared/qty.js";
import { convertQuantity } from "../../../shared/units.js";
import type { InventoryEvent, InventoryLot } from "../../../shared/types.js";

export const MAX_ITEMS = 100;

export const recipeConsumeRequestSchema = z.object({
  recipe_id: z.string().min(1).max(200),
  // Firestore のドキュメント ID(recipeConsumptions/{cooking_event_id})に使う。
  cooking_event_id: z
    .string()
    .regex(/^[A-Za-z0-9_.:-]{1,200}$/)
    .refine((v) => v !== "." && v !== ".." && !/^__.*__$/.test(v)),
  items: z
    .array(
      z.object({
        food_item_id: z.string().min(1).max(200),
        quantity: z.number().finite().positive().max(1_000_000),
        unit: z.string().min(1).max(50),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
});
export type RecipeConsumeRequest = z.infer<typeof recipeConsumeRequestSchema>;

export type ItemError = "not_found" | "unit_mismatch";

export interface ItemResult {
  food_item_id: string;
  /** base_unit で実際に記録した消費量。 */
  consumed: number;
  /** 在庫不足で記録しなかった量(base_unit)。 */
  shortage: number;
  error?: ItemError;
}

/** Firestore に書く CONSUME イベント。フィールドは firestore.rules の許可キーと一致させる。 */
export interface EventDoc {
  inventory_lot_id: string;
  food_item_id: string;
  event_type: "CONSUME";
  quantity_delta: number;
  source_type: "RECIPE";
  source_id: string;
  occurred_at: Date;
  created_at: Date;
  note: string;
}

export interface ProfileDoc {
  consumption_rate: number;
  observation_count: number;
  confidence_score: number;
  calculated_at: Date;
}

export interface ResultDoc {
  recipe_id: string;
  created_at: Date;
  event_ids: string[];
  results: ItemResult[];
}

/** トランザクション内でのデータアクセス(本番は firebase-admin、テストは in-memory)。 */
export interface ConsumeTx {
  getResult(cookingEventId: string): Promise<ResultDoc | null>;
  getFood(foodId: string): Promise<{ base_unit: string } | null>;
  getLots(foodId: string): Promise<InventoryLot[]>;
  getEvents(foodId: string): Promise<InventoryEvent[]>;
  /** イベントを create し、その ID を返す。 */
  createEvent(doc: EventDoc): string;
  setProfile(foodId: string, doc: ProfileDoc): void;
  setResult(cookingEventId: string, doc: ResultDoc): void;
}

export interface RecipeConsumeOutcome {
  results: ItemResult[];
  /** 既に処理済みの cooking_event_id への再送(前回結果をそのまま返した)。 */
  replayed: boolean;
}

export function buildEventDoc(
  foodId: string,
  lotId: string,
  delta: number,
  cookingEventId: string,
  recipeId: string,
  now: Date,
): EventDoc {
  return {
    inventory_lot_id: lotId,
    food_item_id: foodId,
    event_type: "CONSUME",
    quantity_delta: delta,
    source_type: "RECIPE",
    source_id: cookingEventId,
    occurred_at: now,
    created_at: now,
    note: `recipe:${recipeId}`,
  };
}

interface FoodData {
  lots: InventoryLot[];
  events: InventoryEvent[];
  base_unit: string;
  /** この呼び出しで追加した(まだ書き込んでいない)イベント。 */
  added: InventoryEvent[];
}

/**
 * レシピ由来の消費を FIFO で記録する。トランザクション内で呼ぶこと
 * (Firestore の制約に合わせ、読み取りをすべて済ませてから書き込む)。
 * 冪等: recipeConsumptions/{cooking_event_id} があれば前回結果を返し、何も書かない。
 */
export async function executeRecipeConsume(
  tx: ConsumeTx,
  input: RecipeConsumeRequest,
  now: Date,
): Promise<RecipeConsumeOutcome> {
  const existing = await tx.getResult(input.cooking_event_id);
  if (existing) return { results: existing.results, replayed: true };

  // --- 読み取り(食材ごとに 1 回) ---
  const foodIds = [...new Set(input.items.map((i) => i.food_item_id))];
  const data = new Map<string, FoodData | null>();
  for (const id of foodIds) {
    const food = await tx.getFood(id);
    if (!food) {
      data.set(id, null);
      continue;
    }
    data.set(id, {
      base_unit: food.base_unit,
      lots: await tx.getLots(id),
      events: await tx.getEvents(id),
      added: [],
    });
  }

  // --- 計算(同じ食材が複数行あっても、先行分の消費を踏まえて FIFO する) ---
  const results: ItemResult[] = [];
  const newEvents: { foodId: string; lotId: string; delta: number }[] = [];
  for (const item of input.items) {
    const d = data.get(item.food_item_id);
    if (!d) {
      results.push({
        food_item_id: item.food_item_id,
        consumed: 0,
        shortage: 0,
        error: "not_found",
      });
      continue;
    }
    const amount = convertQuantity(item.quantity, item.unit, d.base_unit);
    if (amount === null) {
      results.push({
        food_item_id: item.food_item_id,
        consumed: 0,
        shortage: 0,
        error: "unit_mismatch",
      });
      continue;
    }
    const plan = planFifo(d.lots, [...d.events, ...d.added], amount);
    let consumed = 0;
    for (const a of plan.allocations) {
      newEvents.push({
        foodId: item.food_item_id,
        lotId: a.lotId,
        delta: a.delta,
      });
      d.added.push({
        id: `pending-${newEvents.length}`,
        inventory_lot_id: a.lotId,
        food_item_id: item.food_item_id,
        event_type: "CONSUME",
        quantity_delta: a.delta,
        source_type: "RECIPE",
        source_id: input.cooking_event_id,
        occurred_at: now,
        created_at: now,
      });
      consumed -= a.delta;
    }
    results.push({
      food_item_id: item.food_item_id,
      consumed: roundQty(consumed),
      shortage: plan.shortage,
    });
  }

  // --- 書き込み ---
  const eventIds: string[] = [];
  for (const e of newEvents) {
    eventIds.push(
      tx.createEvent(
        buildEventDoc(
          e.foodId,
          e.lotId,
          e.delta,
          input.cooking_event_id,
          input.recipe_id,
          now,
        ),
      ),
    );
  }
  for (const [foodId, d] of data) {
    if (!d || d.added.length === 0) continue;
    const p = computeConsumptionProfile([...d.events, ...d.added], now);
    tx.setProfile(foodId, {
      consumption_rate: p.consumption_rate,
      observation_count: p.observation_count,
      confidence_score: p.confidence_score,
      calculated_at: now,
    });
  }
  // 冪等性レコードは、CONSUME を 1 件以上書いたときだけ残す。全明細がエラー
  // (not_found / unit_mismatch)や在庫ゼロで何も書かなかった場合は残さず、
  // 呼び出し側が同じ cooking_event_id のまま修正して再送できるようにする。
  if (eventIds.length > 0) {
    tx.setResult(input.cooking_event_id, {
      recipe_id: input.recipe_id,
      created_at: now,
      event_ids: eventIds,
      results,
    });
  }
  return { results, replayed: false };
}
