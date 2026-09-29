import { createHash, timingSafeEqual } from "node:crypto";
import { requireAuth, type AuthedUser } from "../auth.js";

/** 連携トークンの最小長。これ未満は設定ミスとして無効扱い。 */
export const MIN_INTEGRATION_TOKEN_LENGTH = 32;

type Env = Record<string, string | undefined>;

export interface OwnerAuthDeps {
  env?: Env;
  requireAuth?: (header: string | string[] | undefined) => Promise<AuthedUser>;
}

export interface OwnerIdentity {
  uid: string;
  via: "firebase" | "integration_token";
}

function sha256(v: string): Buffer {
  return createHash("sha256").update(v).digest();
}

/** 定数時間比較(ハッシュしてから比べるので長さの違いも漏れない)。 */
export function tokensEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function bearer(header: string | string[] | undefined): string | undefined {
  const h = Array.isArray(header) ? header[0] : header;
  if (!h?.startsWith("Bearer ")) return undefined;
  const t = h.slice("Bearer ".length).trim();
  return t || undefined;
}

/**
 * 連携 API(/api/food-items, /api/recipe-consume)用の認証。
 *  (a) RECIPE_INTEGRATION_TOKEN(32 文字以上。未設定なら無効)と一致 → INVENTORY_OWNER_UID
 *  (b) Firebase ID トークン(requireAuth 成功)→ その uid
 * どちらでもなければ AuthError(401/403、requireAuth が投げる)。
 * 連携トークン一致なのに INVENTORY_OWNER_UID が未設定なのは設定ミス(Error → 500)。
 */
export async function requireOwner(
  authorizationHeader: string | string[] | undefined,
  deps: OwnerAuthDeps = {},
): Promise<OwnerIdentity> {
  const env = deps.env ?? process.env;
  const verify = deps.requireAuth ?? requireAuth;

  const configured = env.RECIPE_INTEGRATION_TOKEN;
  const presented = bearer(authorizationHeader);
  if (
    configured &&
    configured.length >= MIN_INTEGRATION_TOKEN_LENGTH &&
    presented &&
    tokensEqual(presented, configured)
  ) {
    const uid = env.INVENTORY_OWNER_UID?.trim();
    if (!uid) throw new Error("INVENTORY_OWNER_UID is not set");
    return { uid, via: "integration_token" };
  }

  const user = await verify(authorizationHeader);
  return { uid: user.uid, via: "firebase" };
}
