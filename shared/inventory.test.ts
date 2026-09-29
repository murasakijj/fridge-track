import { describe, it, expect } from "vitest";
import {
  foodTotal,
  foodTotals,
  lotBalances,
  planAdjust,
  planDiscardFood,
  planDiscardLot,
  planFifo,
} from "./inventory.js";
import { ev, lot } from "./testUtils.js";

describe("lotBalances / foodTotal", () => {
  it("イベントの合計から Lot 残量を出す(仕様 §3.1 の例)", () => {
    const events = [
      ev("A", "PURCHASE", 100, 0),
      ev("A", "CONSUME", -20, 1),
      ev("A", "CONSUME", -10, 2),
      ev("A", "DISCARD", -5, 3),
      ev("A", "ADJUST", 10, 4),
    ];
    expect(lotBalances(events).get("A")).toBe(75);
    expect(foodTotal(events, "f1")).toBe(75);
  });

  it("複数 Lot を合算する(牛乳 30% + 100%)", () => {
    const events = [ev("A", "PURCHASE", 30, 0), ev("B", "PURCHASE", 100, 1)];
    const b = lotBalances(events);
    expect(b.get("A")).toBe(30);
    expect(b.get("B")).toBe(100);
    expect(foodTotal(events, "f1")).toBe(130);
  });

  it("浮動小数の誤差を丸める", () => {
    const events = [ev("A", "PURCHASE", 0.1, 0), ev("A", "PURCHASE", 0.2, 0)];
    expect(lotBalances(events).get("A")).toBe(0.3);
  });

  it("食材ごとに集計する", () => {
    const events = [
      ev("A", "PURCHASE", 5, 0),
      ev("X", "PURCHASE", 7, 0, { food_item_id: "f2" }),
    ];
    const t = foodTotals(events);
    expect(t.get("f1")).toBe(5);
    expect(t.get("f2")).toBe(7);
    expect(foodTotal(events, "none")).toBe(0);
  });
});

describe("planFifo", () => {
  const lots = [lot("A", 0), lot("B", 1)];
  const events = [ev("A", "PURCHASE", 30, 0), ev("B", "PURCHASE", 100, 1)];

  it("仕様 §14: Lot A 30 / Lot B 100 から 50 消費 → -30 / -20", () => {
    const plan = planFifo(lots, events, 50);
    expect(plan.allocations).toEqual([
      { lotId: "A", delta: -30 },
      { lotId: "B", delta: -20 },
    ]);
    expect(plan.shortage).toBe(0);
  });

  it("1 つの Lot で足りるなら 1 イベントだけ", () => {
    const plan = planFifo(lots, events, 10);
    expect(plan.allocations).toEqual([{ lotId: "A", delta: -10 }]);
  });

  it("在庫不足は shortage として返し、記録は残量まで", () => {
    const plan = planFifo(lots, events, 150);
    expect(plan.allocations).toEqual([
      { lotId: "A", delta: -30 },
      { lotId: "B", delta: -100 },
    ]);
    expect(plan.shortage).toBe(20);
  });

  it("Lot が無ければ全量が shortage", () => {
    expect(planFifo([], [], 5)).toEqual({ allocations: [], shortage: 5 });
  });

  it("残量 0 の Lot は飛ばす", () => {
    const ev2 = [...events, ev("A", "CONSUME", -30, 2)];
    const plan = planFifo(lots, ev2, 40);
    expect(plan.allocations).toEqual([{ lotId: "B", delta: -40 }]);
  });

  it("purchased_at が同じなら created_at、次に id で決める", () => {
    const l1 = lot("z", 0, { created_at: new Date(2000) });
    const l2 = lot("a", 0, { created_at: new Date(1000) });
    const l3 = lot("b", 0, { created_at: new Date(1000) });
    const evs = [
      ev("z", "PURCHASE", 5, 0),
      ev("a", "PURCHASE", 5, 0),
      ev("b", "PURCHASE", 5, 0),
    ];
    const plan = planFifo([l1, l2, l3], evs, 15);
    expect(plan.allocations.map((a) => a.lotId)).toEqual(["a", "b", "z"]);
  });

  it("渡された Lot の順序に依存しない(purchased_at 昇順)", () => {
    const plan = planFifo([lots[1]!, lots[0]!], events, 50);
    expect(plan.allocations.map((a) => a.lotId)).toEqual(["A", "B"]);
  });

  it("0 以下・NaN の量は何もしない", () => {
    expect(planFifo(lots, events, 0)).toEqual({ allocations: [], shortage: 0 });
    expect(planFifo(lots, events, -3)).toEqual({
      allocations: [],
      shortage: 0,
    });
    expect(planFifo(lots, events, NaN)).toEqual({
      allocations: [],
      shortage: 0,
    });
  });

  it("小数の誤差で微小な残りを作らない", () => {
    const evs = [ev("A", "PURCHASE", 0.3, 0), ev("B", "PURCHASE", 0.7, 1)];
    const plan = planFifo(lots, evs, 0.1 + 0.2);
    expect(plan.allocations).toEqual([{ lotId: "A", delta: -0.3 }]);
    expect(plan.shortage).toBe(0);
  });
});

describe("planAdjust", () => {
  const lots = [lot("A", 0), lot("B", 1)];
  const events = [ev("A", "PURCHASE", 30, 0), ev("B", "PURCHASE", 100, 1)];

  it("実在庫が現在値と同じなら何もしない", () => {
    expect(planAdjust(lots, events, 130)).toEqual({
      diff: 0,
      allocations: [],
      newLotDelta: null,
    });
  });

  it("減らす場合は FIFO で負の ADJUST(古い Lot から)", () => {
    const plan = planAdjust(lots, events, 90);
    expect(plan.diff).toBe(-40);
    expect(plan.allocations).toEqual([
      { lotId: "A", delta: -30 },
      { lotId: "B", delta: -10 },
    ]);
    expect(plan.newLotDelta).toBeNull();
  });

  it("増やす場合は残量のある最新 Lot に正の ADJUST(現在値を上書きしない)", () => {
    const plan = planAdjust(lots, events, 150);
    expect(plan.diff).toBe(20);
    expect(plan.allocations).toEqual([{ lotId: "B", delta: 20 }]);
  });

  it("最新 Lot が空なら残量のある最新 Lot に付ける", () => {
    const evs = [...events, ev("B", "CONSUME", -100, 2)];
    const plan = planAdjust(lots, evs, 40);
    expect(plan.allocations).toEqual([{ lotId: "A", delta: 10 }]);
  });

  it("Lot が無ければ新規 Lot を作る", () => {
    const plan = planAdjust([], [], 60);
    expect(plan).toEqual({ diff: 60, allocations: [], newLotDelta: 60 });
  });

  it("全 Lot を使い切っていても増やす場合は新規 Lot", () => {
    const evs = [ev("A", "PURCHASE", 30, 0), ev("A", "CONSUME", -30, 1)];
    const plan = planAdjust([lot("A", 0)], evs, 25);
    expect(plan).toEqual({ diff: 25, allocations: [], newLotDelta: 25 });
  });

  it("0 に補正すると全 Lot を負の ADJUST で使い切る", () => {
    const plan = planAdjust(lots, events, 0);
    expect(plan.allocations).toEqual([
      { lotId: "A", delta: -30 },
      { lotId: "B", delta: -100 },
    ]);
  });

  it("負の実在庫は 0 として扱う", () => {
    expect(planAdjust(lots, events, -5).diff).toBe(-130);
  });
});

describe("discard planning", () => {
  const lots = [lot("A", 0), lot("B", 1)];
  const events = [ev("A", "PURCHASE", 30, 0), ev("B", "PURCHASE", 100, 1)];

  it("Lot 指定: 量省略で残量全部", () => {
    expect(planDiscardLot(events, "B")).toEqual([{ lotId: "B", delta: -100 }]);
  });
  it("Lot 指定: 指定量", () => {
    expect(planDiscardLot(events, "B", 25)).toEqual([
      { lotId: "B", delta: -25 },
    ]);
  });
  it("Lot 指定: 上限は残量", () => {
    expect(planDiscardLot(events, "A", 500)).toEqual([
      { lotId: "A", delta: -30 },
    ]);
  });
  it("Lot 指定: 残量なし・存在しない Lot は空", () => {
    const evs = [...events, ev("A", "CONSUME", -30, 2)];
    expect(planDiscardLot(evs, "A")).toEqual([]);
    expect(planDiscardLot(evs, "nope")).toEqual([]);
    expect(planDiscardLot(evs, "B", 0)).toEqual([]);
  });
  it("食材指定は FIFO", () => {
    const plan = planDiscardFood(lots, events, 40);
    expect(plan.allocations).toEqual([
      { lotId: "A", delta: -30 },
      { lotId: "B", delta: -10 },
    ]);
  });
});
