import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CATEGORY_IDS,
  UNCATEGORIZED,
  categoryLabel,
  groupFoodsByCategory,
  guessCategory,
  isCategoryId,
  normalizeCategory,
} from "./categories.js";

describe("CATEGORIES", () => {
  it("ID は一意で order は昇順", () => {
    expect(new Set(CATEGORY_IDS).size).toBe(CATEGORIES.length);
    const orders = CATEGORIES.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(CATEGORY_IDS[0]).toBe("vegetable");
    expect(CATEGORY_IDS.at(-1)).toBe("other");
  });
  it("UNCATEGORIZED は既知 ID と衝突しない", () => {
    expect(isCategoryId(UNCATEGORIZED)).toBe(false);
  });
});

describe("normalizeCategory / categoryLabel", () => {
  it("既知 ID はそのまま", () => {
    for (const id of CATEGORY_IDS) expect(normalizeCategory(id)).toBe(id);
  });
  it("未知・未設定・非文字列は null", () => {
    for (const x of [
      "",
      "foo",
      "uncategorized",
      "Vegetable",
      null,
      undefined,
      1,
      {},
      [],
    ]) {
      expect(normalizeCategory(x)).toBeNull();
    }
  });
  it("表示名。未知は未分類", () => {
    expect(categoryLabel("seasoning")).toBe("調味料");
    expect(categoryLabel("x")).toBe("未分類");
    expect(categoryLabel(null)).toBe("未分類");
  });
});

describe("guessCategory", () => {
  const cases: [string, string | null][] = [
    ["醤油", "seasoning"],
    ["塩", "seasoning"],
    ["岩塩", "seasoning"],
    ["みりん", "seasoning"],
    ["米酢", "seasoning"],
    ["ごま油", "seasoning"],
    ["トマトケチャップ", "seasoning"],
    ["マヨネーズ", "seasoning"],
    ["顆粒だし", "seasoning"],
    ["鶏がらスープの素", "seasoning"],
    ["牛乳", "egg_dairy"],
    ["卵", "egg_dairy"],
    ["鶏卵", "egg_dairy"],
    ["とろけるチーズ", "egg_dairy"],
    ["ヨーグルト", "egg_dairy"],
    ["バター", "egg_dairy"],
    ["豚こま切れ", "meat_fish"],
    ["鶏もも肉", "meat_fish"],
    ["合いびき肉", "meat_fish"],
    ["ひき肉", "meat_fish"],
    ["鮭", "meat_fish"],
    ["塩鮭", "meat_fish"],
    ["さば", "meat_fish"],
    ["まぐろ", "meat_fish"],
    ["えび", "meat_fish"],
    ["いか", "meat_fish"],
    ["ベーコン", "meat_fish"],
    ["ハム", "meat_fish"],
    ["ソーセージ", "meat_fish"],
    ["豆腐", "soy_processed"],
    ["油揚げ", "soy_processed"],
    ["納豆", "soy_processed"],
    ["トマト缶", "soy_processed"],
    ["玉ねぎ", "vegetable"],
    ["長ネギ", "vegetable"],
    ["にんじん", "vegetable"],
    ["じゃがいも", "vegetable"],
    ["ほうれん草", "vegetable"],
    ["しいたけ", "vegetable"],
    ["トマト", "vegetable"],
    ["りんご", "fruit"],
    ["バナナ", "fruit"],
    ["レモン", "fruit"],
    ["米", "staple"],
    ["食パン", "staple"],
    ["パスタ", "staple"],
    ["うどん", "staple"],
    ["乾燥わかめ", "vegetable"],
    ["めかぶ", "vegetable"],
    ["ひじき", "vegetable"],
    ["のり", "vegetable"],
    ["焼きのり", "vegetable"],
    ["メロンパン", "staple"],
    ["牛乳パン", "staple"],
    ["バターロール", "staple"],
    ["お茶漬けの素", "staple"],
    ["かつお節", "staple"],
    ["焼肉のたれ", "seasoning"],
    ["ごまだれ", "seasoning"],
    ["ゆずぽんタレ", "seasoning"],
    ["和風ドレッシング", "seasoning"],
    ["そうめんつゆ", "seasoning"],
    ["料理酒", "seasoning"],
    ["日本酒", "drink"],
    ["酒", "drink"],
    ["チューハイ", "drink"],
    ["ハイボール", "drink"],
    ["レモンサワー", "drink"],
    ["サワークリーム", null],
    ["いわし", "meat_fish"],
    ["さんま", "meat_fish"],
    ["かつお", "meat_fish"],
    ["しじみ", "meat_fish"],
    ["あさり", "meat_fish"],
    ["明太子", "meat_fish"],
    ["たらこ", "meat_fish"],
    ["いくら", "meat_fish"],
    ["かに", "meat_fish"],
    ["かにかま", "meat_fish"],
    ["マッシュルーム", "vegetable"],
    ["なめこ", "vegetable"],
    ["エリンギ", "vegetable"],
    ["いんげん", "vegetable"],
    ["ししとう", "vegetable"],
    ["すりごま", "seasoning"],
    ["ごま", "seasoning"],
    ["冷凍餃子", "soy_processed"],
    ["パンプキン", null],
    ["麦茶", "drink"],
    ["トマトジュース", "drink"],
    ["豆乳", "drink"],
    ["ミネラルウォーター", "drink"],
    ["", null],
    ["   ", null],
    ["謎の食べ物", null],
  ];
  it.each(cases)("%s -> %s", (name, expected) => {
    expect(guessCategory(name)).toBe(expected);
  });
  it("前後の空白・全角/半角のゆれを吸収する", () => {
    expect(guessCategory("  醤油 ")).toBe("seasoning");
    expect(guessCategory("ﾏﾖﾈｰｽﾞ")).toBe("seasoning");
  });
  it("返り値は常に既知 ID か null", () => {
    for (const [name] of cases) {
      const r = guessCategory(name);
      expect(r === null || isCategoryId(r)).toBe(true);
    }
  });
});

interface Item {
  n: string;
  c?: string | null;
  low?: boolean;
}

describe("groupFoodsByCategory", () => {
  const get = (i: Item) => i.c;
  const att = (i: Item) => i.low === true;

  it("表示順に並べ、空のグループは出さない", () => {
    const items: Item[] = [
      { n: "醤油", c: "seasoning" },
      { n: "にんじん", c: "vegetable" },
      { n: "牛乳", c: "egg_dairy" },
    ];
    const g = groupFoodsByCategory(items, get);
    expect(g.map((x) => x.key)).toEqual([
      "vegetable",
      "egg_dairy",
      "seasoning",
    ]);
    expect(g.map((x) => x.label)).toEqual([
      "野菜・きのこ",
      "卵・乳製品",
      "調味料",
    ]);
  });

  it("未設定・未知は未分類で最後", () => {
    const items: Item[] = [
      { n: "a" },
      { n: "b", c: null },
      { n: "c", c: "bogus" },
      { n: "d", c: "other" },
    ];
    const g = groupFoodsByCategory(items, get);
    expect(g.map((x) => x.key)).toEqual(["other", UNCATEGORIZED]);
    const un = g[1];
    expect(un.label).toBe("未分類");
    expect(un.items.map((i) => i.n)).toEqual(["a", "b", "c"]);
  });

  it("グループ内は入力順を保つ", () => {
    const items: Item[] = [
      { n: "z", c: "fruit" },
      { n: "a", c: "fruit" },
      { n: "m", c: "fruit" },
    ];
    expect(groupFoodsByCategory(items, get)[0].items.map((i) => i.n)).toEqual([
      "z",
      "a",
      "m",
    ]);
  });

  it("件数と要注意件数", () => {
    const items: Item[] = [
      { n: "a", c: "vegetable", low: true },
      { n: "b", c: "vegetable" },
      { n: "c", c: "vegetable", low: true },
      { n: "d", low: true },
    ];
    const g = groupFoodsByCategory(items, get, att);
    expect(g[0]).toMatchObject({
      key: "vegetable",
      count: 3,
      attentionCount: 2,
    });
    expect(g[1]).toMatchObject({
      key: UNCATEGORIZED,
      count: 1,
      attentionCount: 1,
    });
  });

  it("isAttention 省略時は 0、空入力は空配列", () => {
    expect(
      groupFoodsByCategory([{ n: "a", c: "fruit" }], get)[0].attentionCount,
    ).toBe(0);
    expect(groupFoodsByCategory([], get)).toEqual([]);
  });

  it("入力を変更しない", () => {
    const items: Item[] = [
      { n: "a", c: "fruit" },
      { n: "b", c: "vegetable" },
    ];
    const copy = structuredClone(items);
    groupFoodsByCategory(items, get);
    expect(items).toEqual(copy);
  });
});
