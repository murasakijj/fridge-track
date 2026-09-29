import type { ApiRequest, ApiResponse } from "./_lib/types.js";
import { AuthError } from "./_lib/auth.js";
import { sendJson } from "./_lib/http.js";
import { requireOwner } from "./_lib/integration/ownerAuth.js";
import { listFoodItems } from "./_lib/integration/firestoreStore.js";

/** 連携用: FoodItem 一覧 { items: { id, name, base_unit }[] }。ID トークンまたは連携トークンで認証。 */
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

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }

    sendJson(res, 200, { items: await listFoodItems(owner.uid) });
  } catch (err) {
    console.error("[api] unhandled", err);
    sendJson(res, 500, { error: "internal_error" });
  }
}
