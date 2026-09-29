import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeminiProvider } from "./gemini.js";
import { OpenAiProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { getAiProvider } from "./index.js";
import type { FetchLike } from "./http.js";
import { AiProviderError } from "./types.js";

const schema = { type: "object", properties: { a: { type: "number" } } };
const image = { mimeType: "image/jpeg", data: "QUJD" };

function req() {
  return {
    system: "SYS",
    prompt: "PROMPT",
    images: [image],
    jsonSchema: schema,
  };
}

function jsonFetch(body: unknown, status = 200) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GeminiProvider", () => {
  it("画像 + JSON スキーマを渡し、text を JSON にパースして返す", async () => {
    const generateContent = vi.fn<(p: unknown) => Promise<{ text: string }>>(
      async () => ({
        text: '{"a":1}',
      }),
    );
    const p = new GeminiProvider(
      { apiKey: "k", model: "m1" },
      { models: { generateContent } },
    );
    await expect(p.generateJson(req())).resolves.toEqual({ a: 1 });
    const params = generateContent.mock.calls[0]![0] as {
      model: string;
      config: Record<string, unknown>;
      contents: { parts: unknown[] }[];
    };
    expect(params.model).toBe("m1");
    expect(params.config.responseMimeType).toBe("application/json");
    expect(params.config.responseJsonSchema).toEqual(schema);
    expect(params.config.systemInstruction).toBe("SYS");
    expect(params.contents[0]!.parts).toEqual([
      { inlineData: { mimeType: "image/jpeg", data: "QUJD" } },
      { text: "PROMPT" },
    ]);
  });

  it("空・不正な JSON は invalid_ai_output", async () => {
    for (const text of ["", "not json", undefined]) {
      const p = new GeminiProvider(
        { apiKey: "k" },
        { models: { generateContent: async () => ({ text }) } },
      );
      await expect(p.generateJson(req())).rejects.toMatchObject({
        statusCode: 502,
        message: "invalid_ai_output",
      });
    }
  });

  it("503 は overloaded に分類される", async () => {
    const err = Object.assign(new Error("x"), { status: 503 });
    const p = new GeminiProvider(
      { apiKey: "k" },
      {
        models: {
          generateContent: async () => {
            throw err;
          },
        },
      },
    );
    // リトライ待機を避けるため、実時間 sleep を待たずに済むよう最終判定だけ見る
    vi.useFakeTimers();
    const promise = p.generateJson(req());
    const assertion = expect(promise).rejects.toMatchObject({
      message: "overloaded",
    });
    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });
});

describe("OpenAiProvider", () => {
  it("chat/completions に json_schema と画像(data URI)を送る", async () => {
    const f = jsonFetch({
      choices: [{ message: { content: '{"a":2}' } }],
    });
    const p = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-x" }, f);
    await expect(p.generateJson(req())).resolves.toEqual({ a: 2 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-x");
    expect(body.response_format.json_schema.schema).toEqual(schema);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "PROMPT" },
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,QUJD" },
      },
    ]);
  });

  it("baseUrl(OpenAI 互換サーバー)を使える。末尾スラッシュは無視", async () => {
    const f = jsonFetch({ choices: [{ message: { content: '{"a":1}' } }] });
    const p = new OpenAiProvider(
      { apiKey: "k", model: "m", baseUrl: "http://localhost:11434/v1/" },
      f,
    );
    await p.generateJson(req());
    expect(f.mock.calls[0]![0]).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });

  it("コードフェンス付き JSON も読める / 不正なら invalid_ai_output", async () => {
    const fenced = new OpenAiProvider(
      { apiKey: "k", model: "m" },
      jsonFetch({
        choices: [{ message: { content: '```json\n{"a":3}\n```' } }],
      }),
    );
    await expect(fenced.generateJson(req())).resolves.toEqual({ a: 3 });
    const bad = new OpenAiProvider(
      { apiKey: "k", model: "m" },
      jsonFetch({ choices: [{ message: { content: "sorry" } }] }),
    );
    await expect(bad.generateJson(req())).rejects.toBeInstanceOf(
      AiProviderError,
    );
    const none = new OpenAiProvider({ apiKey: "k", model: "m" }, jsonFetch({}));
    await expect(none.generateJson(req())).rejects.toMatchObject({
      message: "invalid_ai_output",
    });
  });

  it("HTTP 400 は upstream_error(リトライしない)。キーや本文をログに出さない", async () => {
    const f = jsonFetch({ error: "secret body" }, 400);
    const p = new OpenAiProvider({ apiKey: "sk-secret", model: "m" }, f);
    await expect(p.generateJson(req())).rejects.toMatchObject({
      statusCode: 502,
      message: "upstream_error",
    });
    expect(f).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(
      (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls,
    );
    expect(logged).not.toContain("sk-secret");
    expect(logged).not.toContain("secret body");
    expect(logged).not.toContain("QUJD");
  });

  it("200 だが本文が JSON でない場合は invalid_ai_output(upstream_error に潰さない)", async () => {
    const f = vi.fn<FetchLike>(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    const p = new OpenAiProvider({ apiKey: "k", model: "m" }, f);
    await expect(p.generateJson(req())).rejects.toMatchObject({
      statusCode: 502,
      message: "invalid_ai_output",
    });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("429 は rate_limited", async () => {
    vi.useFakeTimers();
    const f = jsonFetch({}, 429);
    const p = new OpenAiProvider({ apiKey: "k", model: "m" }, f);
    const assertion = expect(p.generateJson(req())).rejects.toMatchObject({
      message: "rate_limited",
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(f).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});

describe("AnthropicProvider", () => {
  it("tool_use の input を返し、画像を base64 ブロックで送る", async () => {
    const f = jsonFetch({
      content: [{ type: "tool_use", name: "submit_result", input: { a: 5 } }],
    });
    const p = new AnthropicProvider({ apiKey: "ak", model: "claude-x" }, f);
    await expect(p.generateJson(req())).resolves.toEqual({ a: 5 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("ak");
    expect(init.headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-x");
    expect(body.system).toBe("SYS");
    expect(body.tools[0].input_schema).toEqual(schema);
    expect(body.tool_choice).toEqual({ type: "tool", name: "submit_result" });
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
    });
  });

  it("tool_use が無ければテキストを JSON として解釈、それも無ければ invalid_ai_output", async () => {
    const t = new AnthropicProvider(
      { apiKey: "k" },
      jsonFetch({ content: [{ type: "text", text: '{"a":6}' }] }),
    );
    await expect(t.generateJson(req())).resolves.toEqual({ a: 6 });
    const n = new AnthropicProvider(
      { apiKey: "k" },
      jsonFetch({ content: [] }),
    );
    await expect(n.generateJson(req())).rejects.toMatchObject({
      message: "invalid_ai_output",
    });
  });
});

describe("getAiProvider", () => {
  it("既定は gemini", () => {
    expect(getAiProvider({ GEMINI_API_KEY: "k" }).name).toBe("gemini");
  });
  it("AI_PROVIDER で切り替える", () => {
    expect(
      getAiProvider({
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "k",
        AI_MODEL: "gpt-x",
      }).name,
    ).toBe("openai");
    expect(
      getAiProvider({ AI_PROVIDER: "Anthropic", ANTHROPIC_API_KEY: "k" }).name,
    ).toBe("anthropic");
  });
  it("キー未設定・未知のプロバイダは Error", () => {
    expect(() => getAiProvider({})).toThrow("GEMINI_API_KEY");
    expect(() => getAiProvider({ AI_PROVIDER: "openai" })).toThrow(
      "OPENAI_API_KEY",
    );
    // openai は既定モデルを持たないので AI_MODEL 必須
    expect(() =>
      getAiProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" }),
    ).toThrow("AI_MODEL");
    expect(() => getAiProvider({ AI_PROVIDER: "foo" })).toThrow("unknown");
  });
});
