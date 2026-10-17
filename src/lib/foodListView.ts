import { roundQty } from "../../shared/qty.js";
import type { CategoryGroup, GroupKey } from "../../shared/categories.js";

export interface VisibleGroup<T> extends CategoryGroup<T> {
  /** 中身を表示するか。 */
  open: boolean;
  /** 見出しの開閉操作を受け付けるか(検索中・単一カテゴリ選択中は固定)。 */
  toggleable: boolean;
}

export interface FoodListLayout<T> {
  /** 実際に有効な絞り込み(選択中のカテゴリが 0 件なら "all")。 */
  activeFilter: GroupKey | "all";
  groups: VisibleGroup<T>[];
}

/**
 * 一覧の表示レイアウトを決める純粋関数。
 * - 選んだカテゴリが 0 件(検索結果など)なら「すべて」に戻す
 * - 検索中、または単一カテゴリ選択中は該当グループを強制的に開き、開閉は無効
 */
export function layoutFoodList<T>(
  allGroups: readonly CategoryGroup<T>[],
  filter: GroupKey | "all",
  searching: boolean,
  collapsed: ReadonlySet<GroupKey>,
): FoodListLayout<T> {
  const activeFilter =
    filter !== "all" && allGroups.some((g) => g.key === filter)
      ? filter
      : "all";
  const shown =
    activeFilter === "all"
      ? allGroups
      : allGroups.filter((g) => g.key === activeFilter);
  const forced = searching || activeFilter !== "all";
  return {
    activeFilter,
    groups: shown.map((g) => ({
      ...g,
      open: forced || !collapsed.has(g.key),
      toggleable: !forced,
    })),
  };
}

/** 記録上の在庫が 0 以下(roundQty 後)か。推定による「なくなっている可能性」は含めない。 */
export function isZeroStock(total: number): boolean {
  return roundQty(total) <= 0;
}

export interface ZeroStockFilter<T> {
  /** 実際に表示する食材(元の順序を保つ)。 */
  shown: T[];
  /** 在庫 0 のため非表示にした件数。 */
  hiddenZeroCount: number;
}

/**
 * 在庫 0 の食材を隠す純粋関数。
 * 検索中、または showZero のときは隠さない。
 */
export function filterZeroStock<T>(
  items: readonly T[],
  getTotal: (item: T) => number,
  showZero: boolean,
  searching: boolean,
): ZeroStockFilter<T> {
  if (showZero || searching) return { shown: [...items], hiddenZeroCount: 0 };
  const shown = items.filter((i) => !isZeroStock(getTotal(i)));
  return { shown, hiddenZeroCount: items.length - shown.length };
}

export type EmptyStateKind = "none" | "no-foods" | "all-zero" | "no-match";

export interface ListStatusInput {
  loading: boolean;
  error: boolean;
  /** 検索・非表示前の食材総数。 */
  totalFoods: number;
  /** 実際に表示する食材数。 */
  shownCount: number;
  hiddenZeroCount: number;
  showZero: boolean;
}

/** 空状態メッセージと「非表示中」ノートの出し分け。 */
export function listStatus(i: ListStatusInput): {
  empty: EmptyStateKind;
  showHiddenNote: boolean;
} {
  const showHiddenNote = !i.loading && !i.showZero && i.hiddenZeroCount > 0;
  let empty: EmptyStateKind = "none";
  if (!i.loading && !i.error) {
    if (i.totalFoods === 0) empty = "no-foods";
    else if (i.shownCount === 0)
      empty = i.hiddenZeroCount > 0 ? "all-zero" : "no-match";
  }
  return { empty, showHiddenNote };
}
