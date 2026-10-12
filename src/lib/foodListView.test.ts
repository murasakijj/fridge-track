import { describe, it, expect } from "vitest";
import { groupFoodsByCategory } from "../../shared/categories.js";
import { layoutFoodList } from "./foodListView";

const groups = groupFoodsByCategory(
  [{ c: "vegetable" }, { c: "seasoning" }, { c: null }],
  (i) => i.c,
);

describe("layoutFoodList", () => {
  it("通常: 全グループ、折りたたみ状態を反映し開閉可能", () => {
    const l = layoutFoodList(groups, "all", false, new Set(["seasoning"]));
    expect(l.activeFilter).toBe("all");
    expect(l.groups.map((g) => [g.key, g.open, g.toggleable])).toEqual([
      ["vegetable", true, true],
      ["seasoning", false, true],
      ["uncategorized", true, true],
    ]);
  });
  it("検索中は全グループを開き、開閉は無効", () => {
    const l = layoutFoodList(groups, "all", true, new Set(["seasoning"]));
    expect(l.groups.every((g) => g.open && !g.toggleable)).toBe(true);
  });
  it("単一カテゴリ選択中は該当グループだけを強制的に開く", () => {
    const l = layoutFoodList(
      groups,
      "seasoning",
      false,
      new Set(["seasoning"]),
    );
    expect(l.activeFilter).toBe("seasoning");
    expect(l.groups.map((g) => [g.key, g.open, g.toggleable])).toEqual([
      ["seasoning", true, false],
    ]);
  });
  it("選択中のカテゴリが 0 件なら「すべて」に戻る", () => {
    const l = layoutFoodList(groups, "fruit", false, new Set(["seasoning"]));
    expect(l.activeFilter).toBe("all");
    expect(l.groups).toHaveLength(3);
    expect(l.groups[1]!.open).toBe(false);
  });
  it("グループが無ければ空", () => {
    expect(layoutFoodList([], "all", false, new Set()).groups).toEqual([]);
  });
});
