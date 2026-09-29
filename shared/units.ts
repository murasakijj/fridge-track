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

/** 全角英数・スラッシュを半角にし、前後空白を除く。 */
function normalizeUnit(unit: string): string {
  return unit.normalize("NFKC").trim();
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

  if (base === "g" && u.toLowerCase() === "kg") {
    return roundQty(quantity * 1000);
  }
  if (base === "ml" && (u === "L" || u === "l")) {
    return roundQty(quantity * 1000);
  }

  if (base === "%") {
    const ambiguous = AMBIGUOUS_PERCENT[u];
    if (ambiguous !== undefined) return roundQty(quantity * ambiguous);

    const fixed = FRACTION_BAG_PERCENT[u];
    if (fixed !== undefined) return roundQty(quantity * fixed);

    const fraction = /^(\d+)\/(\d+)(袋|本|個)$/.exec(u);
    if (fraction) {
      const den = Number(fraction[2]);
      const per = CONTAINER_UNIT_PERCENT[fraction[3] ?? ""];
      if (den === 0 || per === undefined) return null;
      return roundQty(quantity * (Number(fraction[1]) / den) * per);
    }

    const perContainer = CONTAINER_UNIT_PERCENT[u];
    if (perContainer !== undefined) return roundQty(quantity * perContainer);
  }

  return null;
}
