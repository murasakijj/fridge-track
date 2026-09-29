import type { ApiRequest, ApiResponse } from "./_lib/types.js";
import { requireAuth, AuthError } from "./_lib/auth.js";
import { sendJson, readJsonBody } from "./_lib/http.js";
import { getAiProvider, AiProviderError } from "./_lib/ai/index.js";
import { parseReceipt } from "./_lib/receipt/parse.js";
import {
  MAX_REQUEST_BYTES,
  receiptParseRequestSchema,
} from "./_lib/receipt/schema.js";

export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  try {
    try {
      await requireAuth(req.headers.authorization);
    } catch (err) {
      if (err instanceof AuthError) {
        sendJson(res, err.statusCode, { error: err.message });
        return;
      }
      throw err;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }

    const body = await readJsonBody(req, MAX_REQUEST_BYTES);
    const parsed = receiptParseRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, { error: "invalid_body" });
      return;
    }

    try {
      const result = await parseReceipt(getAiProvider(), parsed.data);
      sendJson(res, 200, result);
    } catch (err) {
      if (err instanceof AiProviderError) {
        sendJson(res, err.statusCode, { error: err.message });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[api] unhandled", err);
    sendJson(res, 500, { error: "internal_error" });
  }
}
