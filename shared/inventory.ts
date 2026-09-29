import { roundQty, isZeroQty } from "./qty.js";
import type {
  Allocation,
  EventLike,
  InventoryEvent,
  LotLike,
} from "./types.js";

type FoodDelta = Pick<InventoryEvent, "food_item_id" | "quantity_delta">;

/** Lot ごとの現在量(イベントの quantity_delta の合計)。 */
export function lotBalances(events: readonly EventLike[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const e of events) {
    sums.set(
      e.inventory_lot_id,
      (sums.get(e.inventory_lot_id) ?? 0) + e.quantity_delta,
    );
  }
  const result = new Map<string, number>();
  for (const [id, sum] of sums) result.set(id, roundQty(sum));
  return result;
}

/** 食材ごとの合計在庫(全 Lot の合算)。 */
export function foodTotals(events: readonly FoodDelta[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const e of events) {
    sums.set(
      e.food_item_id,
      (sums.get(e.food_item_id) ?? 0) + e.quantity_delta,
    );
  }
  const result = new Map<string, number>();
  for (const [id, sum] of sums) result.set(id, roundQty(sum));
  return result;
}

/** 1 食材の合計在庫。events は任意の食材を含んでよい。 */
export function foodTotal(
  events: readonly FoodDelta[],
  foodItemId: string,
): number {
  return foodTotals(events).get(foodItemId) ?? 0;
}

/** purchased_at 昇順、同時刻は created_at、さらに id で安定ソート(古い順)。 */
export function compareLots(a: LotLike, b: LotLike): number {
  return (
    a.purchased_at.getTime() - b.purchased_at.getTime() ||
    a.created_at.getTime() - b.created_at.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface FifoPlan {
  /** 各 Lot に作る負のイベント差分(古い Lot から)。 */
  allocations: Allocation[];
  /** 在庫不足で消費できなかった量(記録しない)。 */
  shortage: number;
}

/**
 * FIFO 消費計画(仕様 §14)。lots / events は対象食材のものを渡す。
 * 残量 > 0 の Lot を古い順に消費し、不足分は shortage として返す。
 */
export function planFifo(
  lots: readonly LotLike[],
  events: readonly EventLike[],
  amount: number,
): FifoPlan {
  let remaining = roundQty(amount);
  if (!(remaining > 0)) return { allocations: [], shortage: 0 };

  const balances = lotBalances(events);
  const allocations: Allocation[] = [];
  for (const lot of [...lots].sort(compareLots)) {
    if (remaining <= 0) break;
    const balance = balances.get(lot.id) ?? 0;
    if (isZeroQty(balance) || balance < 0) continue;
    const take = roundQty(Math.min(balance, remaining));
    if (take <= 0) continue;
    allocations.push({ lotId: lot.id, delta: -take });
    remaining = roundQty(remaining - take);
  }
  return { allocations, shortage: remaining > 0 ? remaining : 0 };
}

export interface AdjustPlan {
  /** actual - current。0 なら何もしない。 */
  diff: number;
  /** 既存 Lot への ADJUST 差分。 */
  allocations: Allocation[];
  /** diff > 0 で加算先の Lot が無いとき、新規 Lot に付ける正の ADJUST 量。 */
  newLotDelta: number | null;
}

/**
 * 在庫補正計画(仕様 §6.1 ADJUST)。「今実際にいくつあるか」を受け取り差分を返す。
 * - diff < 0: FIFO で各 Lot に負の ADJUST
 * - diff > 0: 残量のある最新 Lot に正の ADJUST。無ければ新規 Lot(PURCHASE は作らない)
 */
export function planAdjust(
  lots: readonly LotLike[],
  events: readonly EventLike[],
  actualTotal: number,
): AdjustPlan {
  const actual = Math.max(0, roundQty(actualTotal));
  let current = 0;
  for (const v of lotBalances(events).values()) current += v;
  current = roundQty(current);
  const diff = roundQty(actual - current);

  if (isZeroQty(diff)) return { diff: 0, allocations: [], newLotDelta: null };

  if (diff < 0) {
    const { allocations } = planFifo(lots, events, -diff);
    return { diff, allocations, newLotDelta: null };
  }

  const balances = lotBalances(events);
  const target = [...lots]
    .sort(compareLots)
    .reverse()
    .find((lot) => (balances.get(lot.id) ?? 0) > 0);
  if (target) {
    return {
      diff,
      allocations: [{ lotId: target.id, delta: diff }],
      newLotDelta: null,
    };
  }
  return { diff, allocations: [], newLotDelta: diff };
}

/**
 * Lot 指定の廃棄計画。amount 省略時はその Lot の残量全部。上限は残量。
 * 残量が無ければ空配列。
 */
export function planDiscardLot(
  events: readonly EventLike[],
  lotId: string,
  amount?: number,
): Allocation[] {
  const balance = lotBalances(events).get(lotId) ?? 0;
  if (!(balance > 0) || isZeroQty(balance)) return [];
  const take = roundQty(
    amount === undefined ? balance : Math.min(balance, amount),
  );
  if (!(take > 0)) return [];
  return [{ lotId, delta: -take }];
}

/** 食材指定の廃棄計画(FIFO)。 */
export function planDiscardFood(
  lots: readonly LotLike[],
  events: readonly EventLike[],
  amount: number,
): FifoPlan {
  return planFifo(lots, events, amount);
}
