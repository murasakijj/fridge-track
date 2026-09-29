import { describe, it, expect } from "vitest";
import { buildFoodView } from "./foodView";
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
    // 消費速度 35/日(70 を 2 日)、最終購入から 1 日経過 → 推定残り約 2.7 日
    expect(v.estimate.state).toBe("decreasing");
  });

  it("イベントが無ければ 在庫なし", () => {
    const v = buildFoodView(food, [], [], day(2));
    expect(v.total).toBe(0);
    expect(v.estimate.state).toBe("none");
    expect(v.confidence).toBe("低");
  });
});
