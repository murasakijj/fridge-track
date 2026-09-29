import { describe, it, expect } from "vitest";
import { buildFoodView } from "./foodView";
import { planAdjust } from "../../shared/inventory.js";
import { day, ev, lot } from "../../shared/testUtils.js";
import type { FoodItem } from "../../shared/types.js";

const food: FoodItem = {
  id: "f1",
  name: "牛乳",
  base_unit: "%",
  created_at: day(0),
  updated_at: day(0),
};

describe("buildFoodView", () => {
  it("イベントから Lot 残量と合計を算出する(Lot A 30 / Lot B 100)", () => {
    const lots = [lot("B", 1), lot("A", 0)];
    const events = [
      ev("A", "PURCHASE", 100, 0),
      ev("A", "CONSUME", -70, 1),
      ev("B", "PURCHASE", 100, 1),
      ev("X", "PURCHASE", 9, 1, { food_item_id: "other" }),
    ];
    const v = buildFoodView(food, lots, events, day(2));
    expect(v.lots.map((l) => [l.lot.id, l.balance])).toEqual([
      ["A", 30],
      ["B", 100],
    ]);
    expect(v.total).toBe(130);
    expect(v.events).toHaveLength(3);
    // 消費速度 70/日(最後の観測 day1 まで 1 日で 70)、推定残り 60 → 約 0.9 日
    expect(v.estimate.state).toBe("low");
  });

  it("イベントが無ければ 在庫なし", () => {
    const v = buildFoodView(food, [], [], day(2));
    expect(v.total).toBe(0);
    expect(v.estimate.state).toBe("none");
    expect(v.confidence).toBe("低");
  });

  it("記録済み消費を推定に二重計上しない(100 購入、day1〜5 に 10 ずつ消費)", () => {
    const events = [ev("A", "PURCHASE", 100, 0)];
    for (let i = 1; i <= 5; i++) events.push(ev("A", "CONSUME", -10, i));
    const v = buildFoodView(food, [lot("A", 0)], events, day(5));
    expect(v.total).toBe(50);
    expect(v.estimate.state).not.toBe("maybe_gone");
    expect(v.estimate.estimatedRemaining).toBeCloseTo(50, 10);
  });

  it("total は planAdjust と同じ集合(存在する Lot のみ)で計算する", () => {
    const lots = [lot("A", 0)];
    const events = [
      ev("A", "PURCHASE", 10, 0),
      ev("GHOST", "PURCHASE", 99, 0), // Lot ドキュメントが無いイベントは無視
    ];
    const v = buildFoodView(food, lots, events, day(1));
    expect(v.total).toBe(10);
    expect(planAdjust(lots, events, 10).diff).toBe(0);
  });
});
