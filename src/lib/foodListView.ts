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
