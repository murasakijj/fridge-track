import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAiProvider } from "./openai.js";
import type { AiProvider } from "./types.js";

export { AiProviderError } from "./types.js";
export type { AiProvider, AiJsonRequest, AiImage } from "./types.js";

export const AI_PROVIDER_NAMES = ["gemini", "openai", "anthropic"] as const;
export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];

type Env = Record<string, string | undefined>;

function need(env: Env, key: string, message?: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(message ?? `${key} is not set`);
  return v;
}

/**
 * AI_PROVIDER(gemini | openai | anthropic、既定 gemini)/ AI_MODEL / 各 API キーから
 * プロバイダを作る。新しいプロバイダは AiProvider を実装してここに 1 行足すだけ。
 * 設定不備は Error(呼び出し側で 500 internal_error になる)。
 */
export function getAiProvider(env: Env = process.env): AiProvider {
  const name = (env.AI_PROVIDER?.trim().toLowerCase() || "gemini") as string;
  const model = env.AI_MODEL?.trim() || undefined;
  const baseUrl = env.AI_BASE_URL?.trim() || undefined;
  switch (name) {
    case "gemini":
      return new GeminiProvider({ apiKey: need(env, "GEMINI_API_KEY"), model });
    case "openai":
      // 既定モデルは置かない(画像入力・構造化出力に対応したモデルを明示させる)。
      return new OpenAiProvider({
        apiKey: need(env, "OPENAI_API_KEY"),
        model: need(
          env,
          "AI_MODEL",
          "AI_MODEL is required when AI_PROVIDER=openai",
        ),
        baseUrl,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: need(env, "ANTHROPIC_API_KEY"),
        model,
        baseUrl,
      });
    default:
      throw new Error(`unknown AI_PROVIDER: ${name}`);
  }
}
