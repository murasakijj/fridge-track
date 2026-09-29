import { callWithRetry, HttpStatusError, TIMEOUT_MS } from "./retry.js";
import { AiProviderError } from "./types.js";

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * fetch ベースのプロバイダ共通: JSON を POST して JSON を返す。
 * HTTP エラーは HttpStatusError(status のみ。レスポンス本文・キーは含めない)にして
 * callWithRetry に分類・リトライさせる。
 */
export async function postJson(
  fetchImpl: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts: { logTag: string; model: string },
): Promise<unknown> {
  const payload = JSON.stringify(body);
  return callWithRetry(
    async (signal) => {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: payload,
        signal,
      });
      if (!res.ok) throw new HttpStatusError(res.status);
      try {
        return await res.json();
      } catch {
        throw new AiProviderError(502, "invalid_ai_output");
      }
    },
    { logTag: opts.logTag, deadlineMs: TIMEOUT_MS, model: opts.model },
  );
}

/** モデルが返したテキスト(コードフェンス付きの場合あり)を JSON にパースする。 */
export function parseJsonText(text: unknown): unknown {
  if (typeof text !== "string" || !text.trim()) {
    throw new AiProviderError(502, "invalid_ai_output");
  }
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  if (fence?.[1] !== undefined) t = fence[1];
  try {
    return JSON.parse(t);
  } catch {
    throw new AiProviderError(502, "invalid_ai_output");
  }
}
