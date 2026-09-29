import { describe, it, expect, vi } from "vitest";
import {
  MAX_IMAGE_BASE64_CHARS,
  RECEIPT_JSON_SCHEMA,
  receiptParseRequestSchema,
  sanitizeReceipt,
} from "./schema.js";
import { parseReceipt } from "./parse.js";
import { buildReceiptPrompt } from "./prompt.js";
import { AiProviderError, type AiProvider } from "../ai/types.js";

const foods = [
  { id: "f1", name: "豚肩ロース", base_unit: "g" },
  { id: "f2", name: "牛乳", base_unit: "%" },
];
const validReq = {
  image: { mimeType: "image/jpeg", data: "QUJD" },
  foodItems: foods,
};

describe("receiptParseRequestSchema", () => {
  it("正常なボディを受け付ける", () => {
    expect(receiptParseRequestSchema.safeParse(validReq).success).toBe(true);
    expect(
      receiptParseRequestSchema.safeParse({ ...validReq, foodItems: [] })
        .success,
    ).toBe(true);
  });

  it("許可外の MIME、非 base64、空、4MB 超は拒否", () => {
    const bad = (image: unknown) =>
      receiptParseRequestSchema.safeParse({ ...validReq, image }).success;
    expect(bad({ mimeType: "image/gif", data: "QUJD" })).toBe(false);
    expect(
      bad({ mimeType: "image/png", data: "data:image/png;base64,QUJD" }),
    ).toBe(false);
    expect(bad({ mimeType: "image/png", data: "" })).toBe(false);
    expect(
      bad({
        mimeType: "image/png",
        data: "A".repeat(MAX_IMAGE_BASE64_CHARS + 1),
      }),
    ).toBe(false);
    expect(
      bad({ mimeType: "image/png", data: "A".repeat(MAX_IMAGE_BASE64_CHARS) }),
    ).toBe(true);
  });

  it("foodItems は 500 件を超えても拒否せず先頭 500 件に切り詰める", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `i${i}`,
        name: "x",
        base_unit: "個",
      }));
    const r500 = receiptParseRequestSchema.parse({
      ...validReq,
      foodItems: many(500),
    });
    expect(r500.foodItems).toHaveLength(500);
    const r501 = receiptParseRequestSchema.parse({
      ...validReq,
      foodItems: many(501),
    });
    expect(r501.foodItems).toHaveLength(500);
    expect(r501.foodItems[499]!.id).toBe("i499");
  });
});

describe("RECEIPT_JSON_SCHEMA", () => {
  it("すべての object に additionalProperties:false(OpenAI strict 用)", () => {
    const objects: {
      additionalProperties?: unknown;
      required?: unknown[];
      properties?: object;
    }[] = [];
    const walk = (n: unknown) => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "object") objects.push(o as never);
      Object.values(o).forEach(walk);
    };
    walk(RECEIPT_JSON_SCHEMA);
    expect(objects.length).toBe(2);
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      // strict では全プロパティが required
      expect((o.required ?? []).sort()).toEqual(
        Object.keys(o.properties ?? {}).sort(),
      );
    }
  });
});

describe("sanitizeReceipt", () => {
  const known = new Set(["f1", "f2"]);

  it("正常な出力を整形する", () => {
    const r = sanitizeReceipt(
      {
        purchased_at: "2026-09-20",
        items: [
          {
            raw_name: "国産豚カタロース",
            food_item_id: "f1",
            quantity: 300,
            unit: "g",
          },
          { raw_name: "ネギ", food_item_id: null, quantity: 1, unit: "個" },
        ],
      },
      known,
    );
    expect(r).toEqual({
      purchased_at: "2026-09-20",
      items: [
        {
          raw_name: "国産豚カタロース",
          food_item_id: "f1",
          quantity: 300,
          unit: "g",
        },
        { raw_name: "ネギ", food_item_id: null, quantity: 1, unit: "個" },
      ],
    });
  });

  it("存在しない food_item_id は null に落とす", () => {
    const r = sanitizeReceipt(
      {
        purchased_at: null,
        items: [
          { raw_name: "a", food_item_id: "ghost", quantity: 1, unit: "個" },
        ],
      },
      known,
    );
    expect(r.items[0]!.food_item_id).toBeNull();
    expect(r.purchased_at).toBeUndefined();
  });

  it("不正な明細(数量 0/負/文字列、名前なし)は個別に捨てる", () => {
    const r = sanitizeReceipt(
      {
        purchased_at: "2026-02-30",
        items: [
          { raw_name: "ok", food_item_id: null, quantity: 2, unit: "個" },
          { raw_name: "zero", food_item_id: null, quantity: 0, unit: "個" },
          { raw_name: "neg", food_item_id: null, quantity: -1, unit: "個" },
          { raw_name: "str", food_item_id: null, quantity: "2", unit: "個" },
          { raw_name: "", food_item_id: null, quantity: 1, unit: "個" },
          "garbage",
        ],
      },
      known,
    );
    expect(r.items.map((i) => i.raw_name)).toEqual(["ok"]);
    expect(r.purchased_at).toBeUndefined(); // 存在しない日付
  });

  it("形が違えば ZodError", () => {
    expect(() => sanitizeReceipt({ foo: 1 }, known)).toThrow();
    expect(() => sanitizeReceipt("text", known)).toThrow();
    expect(() => sanitizeReceipt({ items: "x" }, known)).toThrow();
  });

  it("明細は最大 100 件", () => {
    const items = Array.from({ length: 150 }, (_, i) => ({
      raw_name: `n${i}`,
      food_item_id: null,
      quantity: 1,
      unit: "個",
    }));
    expect(sanitizeReceipt({ items }, known).items).toHaveLength(100);
  });
});

describe("parseReceipt", () => {
  function provider(result: unknown | Error): AiProvider & {
    generateJson: ReturnType<typeof vi.fn>;
  } {
    return {
      name: "mock",
      generateJson: vi.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
      }),
    };
  }

  it("画像・スキーマ・食材リストをプロバイダに渡し、検証済みの結果を返す", async () => {
    const p = provider({
      purchased_at: "2026-09-20",
      items: [
        { raw_name: "牛乳1L", food_item_id: "f2", quantity: 1, unit: "本" },
      ],
    });
    const out = await parseReceipt(p, validReq as never);
    expect(out.items[0]!.food_item_id).toBe("f2");
    const arg = p.generateJson.mock.calls[0]![0];
    expect(arg.images).toEqual([{ mimeType: "image/jpeg", data: "QUJD" }]);
    expect(arg.jsonSchema).toBeTruthy();
    expect(arg.prompt).toContain('"id":"f1"');
    expect(arg.system).toContain("レシート");
  });

  it("スキーマ違反の出力は invalid_ai_output(502)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      parseReceipt(provider({ nope: true }), validReq as never),
    ).rejects.toMatchObject({ statusCode: 502, message: "invalid_ai_output" });
  });

  it("プロバイダのエラーはそのまま伝える", async () => {
    await expect(
      parseReceipt(
        provider(new AiProviderError(502, "overloaded")),
        validReq as never,
      ),
    ).rejects.toMatchObject({ message: "overloaded" });
  });
});

describe("buildReceiptPrompt", () => {
  it("食材リストを JSON で含める", () => {
    expect(buildReceiptPrompt(foods)).toContain(JSON.stringify(foods));
  });
});
