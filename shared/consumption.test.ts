import { describe, it, expect } from "vitest";
import {
  computeConsumptionProfile,
  confidenceLabel,
  estimateState,
} from "./consumption.js";
import { day, ev } from "./testUtils.js";

describe("computeConsumptionProfile", () => {
  it("イベントが無ければ全て 0", () => {
    const p = computeConsumptionProfile([], day(10));
    expect(p).toMatchObject({
      consumption_rate: 0,
      observation_count: 0,
      confidence_score: 0,
    });
  });

  it("仕様 §9.3: 10 日で 100 消費 + 5 日在庫なし → 10/日(15 日で割らない)", () => {
    const events = [ev("A", "PURCHASE", 100, 0), ev("A", "CONSUME", -100, 10)];
    const p = computeConsumptionProfile(events, day(15));
    expect(p.stocked_days).toBeCloseTo(10, 10);
    expect(p.used).toBe(100);
    expect(p.consumption_rate).toBeCloseTo(10, 10);
    expect(p.observation_count).toBe(1);
  });

  it("在庫ゼロ期間を挟んだ 2 サイクルでは在庫のある期間だけ積算する", () => {
    const events = [
      ev("A", "PURCHASE", 100, 0),
      ev("A", "CONSUME", -100, 5), // 5 日在庫あり
      ev("B", "PURCHASE", 60, 20), // 15 日在庫なし
      ev("B", "CONSUME", -60, 25), // 5 日在庫あり
    ];
    const p = computeConsumptionProfile(events, day(30));
    expect(p.stocked_days).toBeCloseTo(10, 10);
    expect(p.used).toBe(160);
    expect(p.consumption_rate).toBeCloseTo(16, 10);
  });

  it("最後のイベント〜now は stocked_days に含めるが、速度の分母には含めない", () => {
    const events = [ev("A", "PURCHASE", 100, 0), ev("A", "CONSUME", -20, 2)];
    const p = computeConsumptionProfile(events, day(10));
    expect(p.stocked_days).toBeCloseTo(10, 10);
    expect(p.rate_days).toBeCloseTo(2, 10);
    expect(p.consumption_rate).toBeCloseTo(10, 10);
  });

  it("now が進んでも速度は変わらない(自己減衰しない)", () => {
    const events = [ev("A", "PURCHASE", 100, 0), ev("A", "CONSUME", -20, 2)];
    const a = computeConsumptionProfile(events, day(3));
    const b = computeConsumptionProfile(events, day(60));
    expect(b.consumption_rate).toBeCloseTo(a.consumption_rate, 10);
  });

  it("DISCARD で在庫が 0 になった時点までを分母に含める", () => {
    const events = [
      ev("A", "PURCHASE", 100, 0),
      ev("A", "CONSUME", -50, 5),
      ev("A", "DISCARD", -50, 10), // ここで在庫 0(観測ではない)
    ];
    const p = computeConsumptionProfile(events, day(30));
    expect(p.rate_days).toBeCloseTo(10, 10);
    expect(p.used).toBe(50);
    expect(p.consumption_rate).toBeCloseTo(5, 10);
  });

  it("過去日付の PURCHASE を後から登録しても時系列で計算する", () => {
    // 記録順(created_at)は消費が先、購入が後(遡り登録)。
    const consume = ev("A", "CONSUME", -100, 10, { created_at: day(10) });
    const purchase = ev("A", "PURCHASE", 100, 0, { created_at: day(11) });
    const p = computeConsumptionProfile([consume, purchase], day(15));
    expect(p.stocked_days).toBeCloseTo(10, 10);
    expect(p.consumption_rate).toBeCloseTo(10, 10);
  });

  it("DISCARD は消費に含めないが在庫期間には影響する", () => {
    const events = [
      ev("A", "PURCHASE", 100, 0),
      ev("A", "DISCARD", -50, 5),
      ev("A", "CONSUME", -50, 10),
    ];
    const p = computeConsumptionProfile(events, day(10));
    expect(p.used).toBe(50);
    expect(p.observation_count).toBe(1);
    expect(p.consumption_rate).toBeCloseTo(5, 10);
  });

  it("負の ADJUST は消費、正の ADJUST は消費を相殺、合計が負なら 0", () => {
    const neg = computeConsumptionProfile(
      [ev("A", "PURCHASE", 100, 0), ev("A", "ADJUST", -40, 10)],
      day(10),
    );
    expect(neg.used).toBe(40);
    expect(neg.consumption_rate).toBeCloseTo(4, 10);
    expect(neg.observation_count).toBe(1);

    const pos = computeConsumptionProfile(
      [ev("A", "PURCHASE", 10, 0), ev("A", "ADJUST", 30, 10)],
      day(10),
    );
    expect(pos.used).toBe(0);
    expect(pos.consumption_rate).toBe(0);
  });

  it("在庫期間が 1 日未満なら rate は 0", () => {
    const events = [ev("A", "PURCHASE", 100, 0), ev("A", "CONSUME", -100, 0.5)];
    const p = computeConsumptionProfile(events, day(3));
    expect(p.consumption_rate).toBe(0);
  });

  it("入力順に依存しない(時系列にソートする)", () => {
    const a = ev("A", "PURCHASE", 100, 0);
    const b = ev("A", "CONSUME", -100, 10);
    const p = computeConsumptionProfile([b, a], day(15));
    expect(p.consumption_rate).toBeCloseTo(10, 10);
  });

  it("同時刻の複数 Lot の在庫を合算して判定する", () => {
    const events = [
      ev("A", "PURCHASE", 10, 0),
      ev("B", "PURCHASE", 10, 0),
      ev("A", "CONSUME", -10, 5), // まだ B が残っているので在庫あり継続
      ev("B", "CONSUME", -10, 10),
    ];
    const p = computeConsumptionProfile(events, day(20));
    expect(p.stocked_days).toBeCloseTo(10, 10);
    expect(p.used).toBe(20);
  });

  describe("confidence", () => {
    it("min(1, obs/20) * min(1, stockedDays/30)", () => {
      const events = [ev("A", "PURCHASE", 1000, 0)];
      for (let i = 1; i <= 10; i++) events.push(ev("A", "CONSUME", -1, i));
      // 観測 10 件、在庫期間 15 日(now=15) → 0.5 * 0.5
      const p = computeConsumptionProfile(events, day(15));
      expect(p.observation_count).toBe(10);
      expect(p.confidence_score).toBeCloseTo(0.25, 10);
    });

    it("上限は 1", () => {
      const events = [ev("A", "PURCHASE", 1000, 0)];
      for (let i = 1; i <= 40; i++) events.push(ev("A", "CONSUME", -1, i));
      const p = computeConsumptionProfile(events, day(60));
      expect(p.confidence_score).toBe(1);
    });

    it("ラベル: ≥0.6 高 / ≥0.25 中 / 未満 低", () => {
      expect(confidenceLabel(1)).toBe("高");
      expect(confidenceLabel(0.6)).toBe("高");
      expect(confidenceLabel(0.599)).toBe("中");
      expect(confidenceLabel(0.25)).toBe("中");
      expect(confidenceLabel(0.249)).toBe("低");
      expect(confidenceLabel(0)).toBe("低");
    });
  });
});

describe("estimateState", () => {
  const now = day(10);

  it("在庫 0 以下は 在庫なし", () => {
    expect(estimateState(0, 5, day(0), now, "個").state).toBe("none");
    expect(estimateState(-1, 0, null, now, "個").label).toBe("在庫なし");
  });

  it("推定残量が 0 以下なら なくなっている可能性あり", () => {
    // 100 - 10/日 * 10日 = 0
    const r = estimateState(100, 10, day(0), now, "%");
    expect(r.state).toBe("maybe_gone");
    expect(r.label).toBe("なくなっている可能性あり");
  });

  it("推定残日数 <= 2 は 残り少ない", () => {
    // 100 - 9*10 = 10 → 10/9 日
    expect(estimateState(100, 9, day(0), now, "%").state).toBe("low");
  });

  it("推定残日数 <= 5 は そろそろ減っている可能性あり", () => {
    // 100 - 5*10 = 50 → 10 日 …ではなく: 100 - 8*10 = 20 → 2.5 日
    const r = estimateState(100, 8, day(0), now, "%");
    expect(r.state).toBe("decreasing");
    expect(r.estimatedDaysLeft).toBeCloseTo(2.5, 10);
    expect(r.estimatedRemaining).toBeCloseTo(20, 10);
  });

  it("それ以外は 十分", () => {
    expect(estimateState(100, 1, day(0), now, "%").state).toBe("ok");
  });

  it("境界: 残日数ちょうど 2 / 5 は含む", () => {
    // rate 10, 経過 0 日, total 20 → 2 日
    expect(estimateState(20, 10, now, now, "個").state).toBe("low");
    expect(estimateState(50, 10, now, now, "個").state).toBe("decreasing");
    expect(estimateState(51, 10, now, now, "個").state).toBe("ok");
  });

  it("記録済み消費を二重計上しない(100 購入、day1〜5 に 10 ずつ消費 → day5)", () => {
    const events = [ev("A", "PURCHASE", 100, 0)];
    for (let i = 1; i <= 5; i++) events.push(ev("A", "CONSUME", -10, i));
    const p = computeConsumptionProfile(events, day(5));
    expect(p.consumption_rate).toBeCloseTo(10, 10);
    const consumed = 50;
    const r = estimateState(
      50,
      p.consumption_rate,
      day(0),
      day(5),
      "個",
      consumed,
    );
    expect(r.state).not.toBe("maybe_gone");
    expect(r.estimatedRemaining).toBeCloseTo(50, 10);
    expect(r.estimatedDaysLeft).toBeCloseTo(5, 10);
  });

  it("consumedSinceCheck が予測減少より多くても残量は total を超えない", () => {
    const r = estimateState(50, 1, day(0), day(5), "個", 999);
    expect(r.estimatedRemaining).toBe(50);
  });

  it("未記録の消費(予測 - 記録済み)だけを差し引く", () => {
    // rate 10 × 5 日 = 50 のうち 20 は記録済み → 未記録 30 を引く
    const r = estimateState(80, 10, day(0), day(5), "個", 20);
    expect(r.estimatedRemaining).toBeCloseTo(50, 10);
  });

  it("lastCheckAt が無ければ経過 0 日として扱う", () => {
    expect(estimateState(100, 10, null, now, "個").state).toBe("ok");
  });

  it("lastCheckAt が未来でも経過は負にしない", () => {
    expect(estimateState(100, 10, day(20), now, "個").estimatedRemaining).toBe(
      100,
    );
  });

  it("rate = 0: % 単位で 20 以下なら 残り少ない、超えれば 十分", () => {
    expect(estimateState(20, 0, day(0), now, "%").state).toBe("low");
    expect(estimateState(21, 0, day(0), now, "%").state).toBe("ok");
  });

  it("rate = 0: % 以外は記録値のみで 十分", () => {
    expect(estimateState(1, 0, day(0), now, "個").state).toBe("ok");
  });
});
