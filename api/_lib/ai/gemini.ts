import { GoogleGenAI } from "@google/genai";
import { callWithRetry, TIMEOUT_MS } from "./retry.js";
import {
  AiProviderError,
  type AiJsonRequest,
  type AiProvider,
} from "./types.js";

export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";

/** テストで差し替えられるよう、使う SDK の面だけ型にする。 */
export interface GeminiClientLike {
  models: {
    generateContent(params: unknown): Promise<{ text?: string | undefined }>;
  };
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private client: GeminiClientLike;
  private model: string;

  constructor(
    opts: { apiKey: string; model?: string },
    client?: GeminiClientLike,
  ) {
    this.model = opts.model || GEMINI_DEFAULT_MODEL;
    this.client =
      client ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as GeminiClientLike);
  }

  async generateJson(req: AiJsonRequest): Promise<unknown> {
    const parts: unknown[] = [
      ...(req.images ?? []).map((img) => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      })),
      { text: req.prompt },
    ];
    const response = await callWithRetry(
      (signal) =>
        this.client.models.generateContent({
          model: this.model,
          config: {
            ...(req.system ? { systemInstruction: req.system } : {}),
            responseMimeType: "application/json",
            responseJsonSchema: req.jsonSchema,
            abortSignal: signal,
          },
          contents: [{ role: "user", parts }],
        }),
      { logTag: "ai:gemini", deadlineMs: TIMEOUT_MS, model: this.model },
    );
    const text = response.text;
    if (!text) throw new AiProviderError(502, "invalid_ai_output");
    try {
      return JSON.parse(text);
    } catch {
      throw new AiProviderError(502, "invalid_ai_output");
    }
  }
}
