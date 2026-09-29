import type { ApiRequest, ApiResponse } from "./_lib/types.js";
import { AuthError } from "./_lib/auth.js";
import { sendJson, readJsonBody } from "./_lib/http.js";
import { requireOwner } from "./_lib/integration/ownerAuth.js";
import { runInOwnerTransaction } from "./_lib/integration/firestoreStore.js";
import {
  executeRecipeConsume,
  recipeConsumeRequestSchema,
} from "./_lib/integration/recipeConsume.js";

/**
 * レシピアプリ連携: 料理完了時の食材消費を FIFO で CONSUME(RECIPE)として記録する。
 * cooking_event_id で冪等(再送は前回結果を返す)。
 */
export default async function handler(
  req: ApiRequest,
  res: ApiResponse,
): Promise<void> {
  try {
    let owner;
    try {
      owner = await requireOwner(req.headers.authorization);
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

    const parsed = recipeConsumeRequestSchema.safeParse(
      await readJsonBody(req),
    );
    if (!parsed.success) {
      sendJson(res, 400, { error: "invalid_body" });
      return;
    }

    const outcome = await runInOwnerTransaction(owner.uid, (tx) =>
      executeRecipeConsume(tx, parsed.data, new Date()),
    );
    sendJson(res, 200, {
      results: outcome.results,
      replayed: outcome.replayed,
    });
  } catch (err) {
    console.error("[api] unhandled", err);
    sendJson(res, 500, { error: "internal_error" });
  }
}
