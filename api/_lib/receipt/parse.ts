import { z } from "zod";
import { AiProviderError, type AiProvider } from "../ai/types.js";
import { TIMEOUT_MS } from "../ai/retry.js";
import { buildReceiptPrompt, RECEIPT_SYSTEM_PROMPT } from "./prompt.js";
import {
  RECEIPT_JSON_SCHEMA,
  sanitizeReceipt,
  type ParsedReceipt,
  type ReceiptParseRequest,
} from "./schema.js";

/**
 * レシート画像を解析して明細候補を返す。何も書き込まない(確定はクライアントが
 * ユーザー確認後に行う)。AI 出力は zod で検証し、未知の food_item_id は null にする。
 */
export async function parseReceipt(
  provider: AiProvider,
  input: ReceiptParseRequest,
): Promise<ParsedReceipt> {
  const raw = await provider.generateJson({
    system: RECEIPT_SYSTEM_PROMPT,
    prompt: buildReceiptPrompt(input.foodItems),
    images: [{ mimeType: input.image.mimeType, data: input.image.data }],
    jsonSchema: RECEIPT_JSON_SCHEMA,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  try {
    return sanitizeReceipt(raw, new Set(input.foodItems.map((f) => f.id)));
  } catch (err) {
    // 生の出力内容(レシート由来の個人情報を含み得る)はログに出さない。
    console.error(
      "[receipt-parse] invalid ai output",
      err instanceof z.ZodError ? err.issues.map((i) => i.path.join(".")) : "",
    );
    throw new AiProviderError(502, "invalid_ai_output");
  }
}
