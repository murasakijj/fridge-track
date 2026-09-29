/**
 * 曖昧な量表現の既定値(単位 %)。仕様 §5。
 * 後で設定化できるよう、変換に使う定数はこのファイルに集約する。
 */

/** 語 → %。 */
export const AMBIGUOUS_PERCENT: Readonly<Record<string, number>> = {
  少々: 1,
  適量: 3,
  少量: 3,
  ひとつまみ: 1,
};

/** 容器単位(N 袋 / N 本 / N 個)1 つあたりの % 。 */
export const CONTAINER_UNIT_PERCENT: Readonly<Record<string, number>> = {
  袋: 100,
  本: 100,
  個: 100,
};

/** 分数袋の固定表現 → %。(汎用の `a/b袋` パースでも同じ値になる) */
export const FRACTION_BAG_PERCENT: Readonly<Record<string, number>> = {
  "1/4袋": 25,
  "1/2袋": 50,
  "1袋": 100,
};
