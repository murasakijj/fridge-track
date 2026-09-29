import {
  AMBIGUOUS_PERCENT,
  CONTAINER_UNIT_PERCENT,
  FRACTION_BAG_PERCENT,
} from "./ambiguous.js";
import { roundQty } from "./qty.js";

/** base_unit の候補(SC-03)。自由入力も可。 */
export const BASE_UNIT_OPTIONS = [
  "個",
  "g",
  "ml",
  "%",
  "切",
  "本",
  "枚",
  "パック",
  "袋",
] as const;

/** 全角英数・スラッシュを半角にし、前後空白を除く。ラテン文字だけの単位は小文字化。 */
function normalizeUnit(unit: string): string {
  const u = unit.normalize("NFKC").trim();
  return /^[A-Za-z]+$/.test(u) ? u.toLowerCase() : u;
}

/**
 * 連携 API / レシート確定用の単位変換。quantity を baseUnit 換算にして返す。
 * 変換不能・不正な数量は null。
 *  - 同一単位: そのまま
 *  - kg→g ×1000, L→ml ×1000
 *  - baseUnit が "%": 曖昧表現(少々 等)・分数袋(1/4袋 等)・N袋/N本/N個 を % に
 */
export function convertQuantity(
  quantity: number,
  unit: string,
  baseUnit: string,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const u = normalizeUnit(unit);
  const base = normalizeUnit(baseUnit);

  if (u === base) return roundQty(quantity);

  if (base === "g" && u === "kg") {
    return roundQty(quantity * 1000);
  }
  if (base === "ml" && u === "l") {
    return roundQty(quantity * 1000);
  }

  if (base === "%") {
    const ambiguous = AMBIGUOUS_PERCENT[u];
    if (ambiguous !== undefined) return roundQty(quantity * ambiguous);

    const fixed = FRACTION_BAG_PERCENT[u];
    if (fixed !== undefined) return roundQty(quantity * fixed);

    // N袋 / 0.5袋 / 1/2袋 (袋・本・個は容器単位)
    const container = /^(\d+(?:\.\d+)?)(?:\/(\d+))?(袋|本|個)$/.exec(u);
    if (container) {
      const num = Number(container[1]);
      const den = container[2] === undefined ? 1 : Number(container[2]);
      const per = CONTAINER_UNIT_PERCENT[container[3] ?? ""];
      if (den === 0 || per === undefined) return null;
      const pct = roundQty(quantity * (num / den) * per);
      return pct > 0 ? pct : null;
    }

    const perContainer = CONTAINER_UNIT_PERCENT[u];
    if (perContainer !== undefined) return roundQty(quantity * perContainer);
  }

  return null;
}
