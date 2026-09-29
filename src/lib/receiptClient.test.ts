import { describe, it, expect, vi } from "vitest";

vi.mock("./firebase", () => ({ auth: { currentUser: null } }));

const { receiptErrorMessage } = await import("./receiptClient");
const { ApiError } = await import("./apiClient");

describe("receiptErrorMessage", () => {
  it("rate_limited / overloaded / upstream_error はそれぞれ別の文言", () => {
    const msgs = ["rate_limited", "overloaded", "upstream_error"].map((c) =>
      receiptErrorMessage(new ApiError(502, c)),
    );
    expect(new Set(msgs).size).toBe(3);
    expect(msgs[0]).toContain("上限");
    expect(msgs[1]).toContain("混み合");
  });

  it("invalid_ai_output / 未知のコード / 通信エラーにも文言を返す", () => {
    expect(
      receiptErrorMessage(new ApiError(502, "invalid_ai_output")),
    ).toContain("読み取れません");
    expect(receiptErrorMessage(new ApiError(500, "server_error"))).toContain(
      "失敗",
    );
    expect(receiptErrorMessage(new TypeError("Failed to fetch"))).toContain(
      "通信",
    );
  });

  it("タイムアウト", () => {
    const e = new Error("t");
    e.name = "TimeoutError";
    expect(receiptErrorMessage(e)).toContain("時間");
  });
});
