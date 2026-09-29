/** 数量の丸め桁(小数第 3 位)。 */
const SCALE = 1000;

/** 残量がこの絶対値未満なら 0 とみなす。 */
export const ZERO_EPSILON = 0.0005;

/** 浮動小数の誤差対策として小数第 3 位で丸める。-0 は 0 にする。 */
export function roundQty(x: number): number {
  const r = Math.round(x * SCALE) / SCALE;
  return r === 0 ? 0 : r;
}

export function isZeroQty(x: number): boolean {
  return Math.abs(x) < ZERO_EPSILON;
}
