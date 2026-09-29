import { roundQty } from "./qty.js";
import type { InventoryEvent } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 消費プロファイルの計算に使うイベントの最小形。 */
export type ProfileEvent = Pick<
  InventoryEvent,
  "id" | "event_type" | "quantity_delta" | "occurred_at" | "created_at"
>;

export interface ConsumptionProfile {
  /** base_unit / 日 */
  consumption_rate: number;
  /** CONSUME + ADJUST イベント数 */
  observation_count: number;
  /** 0..1 */
  confidence_score: number;
  /** 在庫 > 0 だった期間(日、最後のイベント〜now を含む)。信頼度の計算に使う。 */
  stocked_days: number;
  /** 消費速度の分母: 最後の観測(最後の CONSUME/ADJUST か在庫 0 到達)までの在庫あり日数。 */
  rate_days: number;
  /** 期間中の消費量(base_unit)。表示・検証用。 */
  used: number;
}

export type ConfidenceLabel = "高" | "中" | "低";

function compareEvents(a: ProfileEvent, b: ProfileEvent): number {
  return (
    a.occurred_at.getTime() - b.occurred_at.getTime() ||
    a.created_at.getTime() - b.created_at.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * 1 食材のイベント列から消費速度・観測数・信頼度を計算する(仕様 §9)。
 * - 在庫ゼロ期間は stockedDays に含めない(§9.3)
 * - used = Σ(-delta) over CONSUME / ADJUST(未記録消費は負の ADJUST、上振れ補正は正の ADJUST で相殺)。DISCARD は含めない。負なら 0
 * - 速度の分母は最後の観測までの在庫あり日数(最後の観測〜now の未消費期間は含めない)
 * - 履歴が少なくても同一ロジック(§9.4)。信頼度は別に返す
 */
export function computeConsumptionProfile(
  foodEvents: readonly ProfileEvent[],
  now: Date,
): ConsumptionProfile {
  const events = [...foodEvents].sort(compareEvents);

  let total = 0;
  let stockedMs = 0;
  let rateMs = 0;
  let prevTime: number | null = null;
  let used = 0;
  let observations = 0;

  for (const e of events) {
    const t = e.occurred_at.getTime();
    if (prevTime !== null && total > 0 && t > prevTime) {
      stockedMs += t - prevTime;
    }
    prevTime = Math.max(prevTime ?? t, t);
    const wasStocked = total > 0;
    total = roundQty(total + e.quantity_delta);

    const isObservation =
      e.event_type === "CONSUME" || e.event_type === "ADJUST";
    if (isObservation) {
      used += -e.quantity_delta;
      observations += 1;
    }
    // 最後の観測(または在庫が 0 になった時点)までの在庫あり日数を分母にする。
    if (isObservation || (wasStocked && total <= 0)) rateMs = stockedMs;
  }
  if (prevTime !== null && total > 0 && now.getTime() > prevTime) {
    stockedMs += now.getTime() - prevTime;
  }

  const stockedDays = stockedMs / DAY_MS;
  used = Math.max(0, roundQty(used));
  const rateDays = rateMs / DAY_MS;
  const rate = rateDays >= 1 ? used / rateDays : 0;
  const confidence =
    Math.min(1, observations / 20) * Math.min(1, stockedDays / 30);

  return {
    consumption_rate: rate,
    observation_count: observations,
    confidence_score: confidence,
    stocked_days: stockedDays,
    rate_days: rateDays,
    used,
  };
}

/** 信頼度ラベル: ≥0.6 高 / ≥0.25 中 / それ未満 低。 */
export function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 0.6) return "高";
  if (score >= 0.25) return "中";
  return "低";
}

export type EstimateStateKey =
  "none" | "maybe_gone" | "low" | "decreasing" | "ok";

export interface EstimatedState {
  state: EstimateStateKey;
  label: string;
  /** 推定残量(rate > 0 のときのみ)。 */
  estimatedRemaining: number | null;
  /** 推定残日数(rate > 0 のときのみ)。 */
  estimatedDaysLeft: number | null;
}

const LABELS: Record<EstimateStateKey, string> = {
  none: "在庫なし",
  maybe_gone: "なくなっている可能性あり",
  low: "残り少ない",
  decreasing: "そろそろ減っている可能性あり",
  ok: "十分",
};

/**
 * 一覧の「推定状態」。記録上の在庫(total)と推定は呼び出し側で分けて表示する。
 * lastCheckAt は最後の PURCHASE / ADJUST の日時(無ければ null → 経過 0 日)。
 */
export function estimateState(
  total: number,
  rate: number,
  lastCheckAt: Date | null,
  now: Date,
  unit: string,
  /** lastCheckAt より後に記録済みの CONSUME 合計(Σ-delta)。二重計上を避けるため差し引く。 */
  consumedSinceCheck = 0,
): EstimatedState {
  const make = (
    state: EstimateStateKey,
    estimatedRemaining: number | null = null,
    estimatedDaysLeft: number | null = null,
  ): EstimatedState => ({
    state,
    label: LABELS[state],
    estimatedRemaining,
    estimatedDaysLeft,
  });

  if (total <= 0) return make("none");

  if (rate > 0) {
    const elapsedDays = lastCheckAt
      ? Math.max(0, (now.getTime() - lastCheckAt.getTime()) / DAY_MS)
      : 0;
    const unrecorded = Math.max(0, rate * elapsedDays - consumedSinceCheck);
    const remaining = total - unrecorded;
    if (remaining <= 0) return make("maybe_gone", remaining, 0);
    const daysLeft = remaining / rate;
    if (daysLeft <= 2) return make("low", remaining, daysLeft);
    if (daysLeft <= 5) return make("decreasing", remaining, daysLeft);
    return make("ok", remaining, daysLeft);
  }

  if (unit === "%" && total <= 20) return make("low");
  return make("ok");
}
