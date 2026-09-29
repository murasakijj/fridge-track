import { describe, it, expect } from "vitest";
import {
  buildReviewRows,
  fitWithin,
  initialQuantity,
  mappingDocId,
  normalizeRawName,
} from "./receipt.js";

describe("normalizeRawName", () => {
  it("全角半角・大文字小文字・空白・記号の差を吸収する", () => {
    expect(normalizeRawName("国産 豚カタロース")).toBe("国産豚カタロース");
    expect(normalizeRawName("ＭＩＬＫ　1Ｌ")).toBe("milk1l");
    expect(normalizeRawName("★牛乳(1L)")).toBe(normalizeRawName("牛乳 1L"));
    expect(normalizeRawName("ﾈｷﾞ")).toBe("ネギ");
  });
});

describe("mappingDocId", () => {
  it("決定的で、Firestore の ID として安全", () => {
    const a = mappingDocId(normalizeRawName("国産豚カタロース"));
    expect(a).toBe(mappingDocId(normalizeRawName("国産 豚カタロース")));
    expect(a).toMatch(/^m_[0-9a-z]+$/);
    expect(a).not.toBe(mappingDocId(normalizeRawName("牛乳")));
  });
});

describe("fitWithin", () => {
  it("長辺を上限に縮小し、縦横比を保つ", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("上限以下は拡大しない", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe("initialQuantity", () => {
  it("base_unit へ換算する", () => {
    expect(initialQuantity(0.3, "kg", "g")).toBe("300");
    expect(initialQuantity(2, "個", "個")).toBe("2");
    expect(initialQuantity(1, "本", "%")).toBe("100");
  });
  it("換算不能・食材未選択は空", () => {
    expect(initialQuantity(300, "g", "個")).toBe("");
    expect(initialQuantity(1, "個", undefined)).toBe("");
  });
});

describe("buildReviewRows", () => {
  const foods = [
    { id: "f1", base_unit: "g" },
    { id: "f2", base_unit: "%" },
  ];

  it("保存済みマッピングを AI 提案より優先する", () => {
    const rows = buildReviewRows(
      [
        {
          raw_name: "国産 豚カタロース",
          food_item_id: "f2",
          quantity: 300,
          unit: "g",
        },
      ],
      foods,
      [{ raw_name: normalizeRawName("国産豚カタロース"), food_item_id: "f1" }],
    );
    expect(rows[0]).toMatchObject({
      food_item_id: "f1",
      quantity: "300",
      included: true,
    });
  });

  it("マッピングが無ければ AI 提案、存在しない id や提案なしは未選択", () => {
    const rows = buildReviewRows(
      [
        { raw_name: "牛乳", food_item_id: "f2", quantity: 1, unit: "本" },
        { raw_name: "謎", food_item_id: "ghost", quantity: 1, unit: "個" },
        { raw_name: "ネギ", food_item_id: null, quantity: 1, unit: "個" },
      ],
      foods,
      [],
    );
    expect(rows.map((r) => r.food_item_id)).toEqual(["f2", "", ""]);
    expect(rows[0]!.quantity).toBe("100");
    expect(rows[1]!.quantity).toBe("");
  });

  it("マッピング先が削除済み(存在しない)なら無視する", () => {
    const rows = buildReviewRows(
      [{ raw_name: "牛乳", food_item_id: "f2", quantity: 1, unit: "本" }],
      foods,
      [{ raw_name: "牛乳", food_item_id: "gone" }],
    );
    expect(rows[0]!.food_item_id).toBe("f2");
  });

  it("換算不能なら数量は空(入力必須)", () => {
    const rows = buildReviewRows(
      [{ raw_name: "豚", food_item_id: "f1", quantity: 2, unit: "パック" }],
      foods,
      [],
    );
    expect(rows[0]!.quantity).toBe("");
    expect(rows[0]!.ai_unit).toBe("パック");
  });
});
