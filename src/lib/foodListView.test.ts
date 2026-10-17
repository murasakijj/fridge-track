import { describe, it, expect } from "vitest";
import { groupFoodsByCategory } from "../../shared/categories.js";
import {
  filterZeroStock,
  isZeroStock,
  layoutFoodList,
  listStatus,
} from "./foodListView";

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

describe("isZeroStock", () => {
  it("roundQty 後に 0 以下なら在庫 0", () => {
    expect(isZeroStock(0)).toBe(true);
    expect(isZeroStock(-1)).toBe(true);
    expect(isZeroStock(0.0004)).toBe(true);
    expect(isZeroStock(0.0005)).toBe(false);
    expect(isZeroStock(1)).toBe(false);
  });
});

describe("filterZeroStock", () => {
  const foods = [
    { id: "a", c: "vegetable", total: 2 },
    { id: "b", c: "vegetable", total: 0 },
    { id: "c", c: "seasoning", total: 0.0004 },
    { id: "d", c: "seasoning", total: 0.001 },
    { id: "e", c: null, total: -1 },
  ];
  const t = (f: (typeof foods)[number]) => f.total;
  const ids = (xs: typeof foods) => xs.map((x) => x.id);

  it("既定(非表示)では在庫 0 を除き、件数を返す", () => {
    const r = filterZeroStock(foods, t, false, false);
    expect(ids(r.shown)).toEqual(["a", "d"]);
    expect(r.hiddenZeroCount).toBe(3);
  });
  it("表示 ON なら全件、非表示件数は 0", () => {
    const r = filterZeroStock(foods, t, true, false);
    expect(r.shown).toHaveLength(5);
    expect(r.hiddenZeroCount).toBe(0);
  });
  it("検索中は在庫 0 も常に表示", () => {
    const r = filterZeroStock(foods, t, false, true);
    expect(r.shown).toHaveLength(5);
    expect(r.hiddenZeroCount).toBe(0);
  });
  it("推定で maybe_gone でも記録上の在庫があれば表示(total だけで判定)", () => {
    const items = [{ id: "m", total: 1, estimate: "maybe_gone" }];
    const r = filterZeroStock(items, (i) => i.total, false, false);
    expect(r.shown).toHaveLength(1);
  });
  it("グループ件数・要注意件数は表示対象だけで数え、空グループは消える", () => {
    const r = filterZeroStock(foods, t, false, false);
    const g = groupFoodsByCategory(
      r.shown,
      (f) => f.c,
      (f) => f.id === "d",
    );
    expect(g.map((x) => [x.key, x.count, x.attentionCount])).toEqual([
      ["vegetable", 1, 0],
      ["seasoning", 1, 1],
    ]);
    const allZero = filterZeroStock(
      foods.filter((f) => isZeroStock(f.total)),
      t,
      false,
      false,
    );
    expect(allZero.shown).toHaveLength(0);
    expect(allZero.hiddenZeroCount).toBe(3);
    expect(groupFoodsByCategory(allZero.shown, (f) => f.c)).toEqual([]);
  });
});

describe("listStatus", () => {
  const base = {
    loading: false,
    error: false,
    totalFoods: 3,
    shownCount: 2,
    hiddenZeroCount: 1,
    showZero: false,
  };
  it("通常表示: 空状態なし、非表示ノートあり", () => {
    expect(listStatus(base)).toEqual({ empty: "none", showHiddenNote: true });
  });
  it("ノートは N=0・表示ON・読み込み中では出ない", () => {
    expect(listStatus({ ...base, hiddenZeroCount: 0 }).showHiddenNote).toBe(
      false,
    );
    expect(listStatus({ ...base, showZero: true }).showHiddenNote).toBe(false);
    expect(listStatus({ ...base, loading: true }).showHiddenNote).toBe(false);
  });
  it("食材なし / 全て在庫0 / 該当なし", () => {
    expect(
      listStatus({ ...base, totalFoods: 0, shownCount: 0, hiddenZeroCount: 0 })
        .empty,
    ).toBe("no-foods");
    expect(listStatus({ ...base, shownCount: 0 }).empty).toBe("all-zero");
    expect(
      listStatus({ ...base, shownCount: 0, hiddenZeroCount: 0 }).empty,
    ).toBe("no-match");
  });
  it("エラー中・読み込み中は空状態を出さない", () => {
    const e = { ...base, totalFoods: 0, shownCount: 0, hiddenZeroCount: 0 };
    expect(listStatus({ ...e, error: true }).empty).toBe("none");
    expect(listStatus({ ...e, loading: true }).empty).toBe("none");
    expect(
      listStatus({ ...base, shownCount: 0, hiddenZeroCount: 0, error: true })
        .empty,
    ).toBe("none");
  });
});
