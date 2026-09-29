import { z } from "zod";

/** 画像(base64 文字列)の上限。Vercel のリクエスト上限(約 4.5MB)に収まる 4MB。 */
export const MAX_IMAGE_BASE64_CHARS = 4 * 1024 * 1024;
export const MAX_FOOD_ITEMS = 500;
/** リクエストボディ全体の上限(画像 + 食材リスト)。 */
export const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024;

export const receiptParseRequestSchema = z.object({
  image: z.object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    data: z
      .string()
      .min(1)
      .max(MAX_IMAGE_BASE64_CHARS)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
  foodItems: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        name: z.string().min(1).max(200),
        base_unit: z.string().min(1).max(50),
      }),
    )
    // 多すぎる場合は拒否せず先頭 MAX_FOOD_ITEMS 件に切り詰める(ボディ全体は別途上限あり)。
    .transform((items) => items.slice(0, MAX_FOOD_ITEMS)),
});
export type ReceiptParseRequest = z.infer<typeof receiptParseRequestSchema>;

export interface ParsedReceiptItem {
  raw_name: string;
  food_item_id: string | null;
  quantity: number;
  unit: string;
}

export interface ParsedReceipt {
  purchased_at?: string;
  items: ParsedReceiptItem[];
}

/** AI に要求する出力の JSON Schema(プロバイダ非依存)。 */
export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    purchased_at: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          raw_name: { type: "string" },
          food_item_id: { type: ["string", "null"] },
          quantity: { type: "number" },
          unit: { type: "string" },
        },
        required: ["raw_name", "food_item_id", "quantity", "unit"],
      },
    },
  },
  required: ["purchased_at", "items"],
} as const;

const aiOutputSchema = z.object({
  purchased_at: z.unknown().optional(),
  items: z.array(z.unknown()),
});

const aiItemSchema = z.object({
  raw_name: z.string().trim().min(1).max(200),
  food_item_id: z.string().nullable().optional(),
  quantity: z.number().finite().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(50),
});

const MAX_ITEMS = 100;

function validDate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) {
    return undefined;
  }
  return v.trim();
}

/**
 * AI 出力を検証・整形する。
 * - 形が違えば ZodError(呼び出し側で invalid_ai_output)
 * - 不正な明細は個別に捨てる(数量が正でない等)
 * - 渡していない food_item_id は null に落とす
 */
export function sanitizeReceipt(
  raw: unknown,
  knownFoodItemIds: ReadonlySet<string>,
): ParsedReceipt {
  const out = aiOutputSchema.parse(raw);
  const items: ParsedReceiptItem[] = [];
  for (const candidate of out.items) {
    const r = aiItemSchema.safeParse(candidate);
    if (!r.success) continue;
    const id = r.data.food_item_id;
    items.push({
      raw_name: r.data.raw_name,
      food_item_id: id && knownFoodItemIds.has(id) ? id : null,
      quantity: r.data.quantity,
      unit: r.data.unit,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  const purchased_at = validDate(out.purchased_at);
  return { ...(purchased_at ? { purchased_at } : {}), items };
}
