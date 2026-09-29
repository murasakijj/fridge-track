import {
  computeConsumptionProfile,
  confidenceLabel,
  estimateState,
  type ConfidenceLabel,
  type ConsumptionProfile,
  type EstimatedState,
} from "../../shared/consumption.js";
import {
  compareLots,
  lotBalances,
  stockTotal,
} from "../../shared/inventory.js";
import type {
  FoodItem,
  InventoryEvent,
  InventoryLot,
} from "../../shared/types.js";

export interface LotView {
  lot: InventoryLot;
  balance: number;
}

export interface FoodView {
  food: FoodItem;
  /** 記録上の在庫(イベントの合計)。 */
  total: number;
  /** 古い順。 */
  lots: LotView[];
  events: InventoryEvent[];
  profile: ConsumptionProfile;
  confidence: ConfidenceLabel;
  estimate: EstimatedState;
}

/** 食材 1 件分の表示用集計。数量はすべてイベントから算出する。 */
export function buildFoodView(
  food: FoodItem,
  allLots: readonly InventoryLot[],
  allEvents: readonly InventoryEvent[],
  now: Date,
): FoodView {
  const events = allEvents.filter((e) => e.food_item_id === food.id);
  const balances = lotBalances(events);
  const lots = allLots
    .filter((l) => l.food_item_id === food.id)
    .sort(compareLots)
    .map((lot) => ({ lot, balance: balances.get(lot.id) ?? 0 }));
  // planAdjust と同じ関数・同じ集合(存在する Lot)で合計を出す。
  const total = stockTotal(
    lots.map((l) => l.lot),
    events,
  );

  const profile = computeConsumptionProfile(events, now);
  let lastCheckAt: Date | null = null;
  for (const e of events) {
    if (
      (e.event_type === "PURCHASE" || e.event_type === "ADJUST") &&
      (!lastCheckAt || e.occurred_at > lastCheckAt)
    ) {
      lastCheckAt = e.occurred_at;
    }
  }
  const checkAt = lastCheckAt;
  const consumedSinceCheck = events
    .filter(
      (e) =>
        e.event_type === "CONSUME" &&
        (!checkAt || e.occurred_at.getTime() > checkAt.getTime()),
    )
    .reduce((s, e) => s - e.quantity_delta, 0);
  return {
    food,
    total,
    lots,
    events,
    profile,
    confidence: confidenceLabel(profile.confidence_score),
    estimate: estimateState(
      total,
      profile.consumption_rate,
      lastCheckAt,
      now,
      food.base_unit,
      consumedSinceCheck,
    ),
  };
}
