import { parseJsonText, postJson, type FetchLike } from "./http.js";
import {
  AiProviderError,
  type AiJsonRequest,
  type AiProvider,
} from "./types.js";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

/**
 * OpenAI Chat Completions(fetch のみ・SDK なし)。
 * baseUrl を変えれば OpenAI 互換サーバーも使える(AI_BASE_URL)。
 * 構造化出力は response_format: json_schema。
 */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(
    opts: { apiKey: string; model: string; baseUrl?: string },
    fetchImpl?: FetchLike,
  ) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = (opts.baseUrl || OPENAI_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async generateJson(req: AiJsonRequest): Promise<unknown> {
    const userContent: unknown[] = [
      { type: "text", text: req.prompt },
      ...(req.images ?? []).map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      })),
    ];
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      { role: "user", content: userContent },
    ];
    const json = await postJson(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: "result", strict: true, schema: req.jsonSchema },
        },
      },
      { logTag: "ai:openai", model: this.model },
    );
    const content = (
      json as { choices?: { message?: { content?: unknown } }[] } | null
    )?.choices?.[0]?.message?.content;
    if (content === undefined)
      throw new AiProviderError(502, "invalid_ai_output");
    return parseJsonText(content);
  }
}
