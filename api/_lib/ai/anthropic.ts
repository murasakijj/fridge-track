import { parseJsonText, postJson, type FetchLike } from "./http.js";
import {
  AiProviderError,
  type AiJsonRequest,
  type AiProvider,
} from "./types.js";

export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

/**
 * Anthropic Messages API(fetch のみ・SDK なし)。
 * JSON 出力はツール呼び出し(tool_choice でツールを強制)で得る。
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(
    opts: { apiKey: string; model?: string; baseUrl?: string },
    fetchImpl?: FetchLike,
  ) {
    this.apiKey = opts.apiKey;
    this.model = opts.model || ANTHROPIC_DEFAULT_MODEL;
    this.baseUrl = (opts.baseUrl || ANTHROPIC_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async generateJson(req: AiJsonRequest): Promise<unknown> {
    const content: unknown[] = [
      ...(req.images ?? []).map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      })),
      { type: "text", text: req.prompt },
    ];
    const json = await postJson(
      this.fetchImpl,
      `${this.baseUrl}/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: 4096,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content }],
        tools: [
          {
            name: "submit_result",
            description: "Submit the result as structured JSON.",
            input_schema: req.jsonSchema,
          },
        ],
        tool_choice: { type: "tool", name: "submit_result" },
      },
      { logTag: "ai:anthropic", model: this.model },
    );
    const blocks =
      (
        json as {
          content?: { type?: string; input?: unknown; text?: unknown }[];
        } | null
      )?.content ?? [];
    const tool = blocks.find((b) => b.type === "tool_use");
    if (tool && tool.input !== undefined) return tool.input;
    // ツール呼び出しが無い場合はテキストを JSON として解釈する。
    const text = blocks.find((b) => b.type === "text")?.text;
    if (text === undefined) throw new AiProviderError(502, "invalid_ai_output");
    return parseJsonText(text);
  }
}
