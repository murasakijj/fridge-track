import { describe, it, expect } from "vitest";
import { roundQty, isZeroQty } from "./qty.js";

describe("roundQty", () => {
  it("小数第3位で丸める", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(1.23456)).toBe(1.235);
    expect(roundQty(-1.23449)).toBe(-1.234);
  });
  it("-0 を 0 にする", () => {
    expect(Object.is(roundQty(-0.0001), 0)).toBe(true);
  });
  it("isZeroQty は 0.0005 未満を 0 とみなす", () => {
    expect(isZeroQty(0.0004)).toBe(true);
    expect(isZeroQty(-0.0004)).toBe(true);
    expect(isZeroQty(0.0005)).toBe(false);
  });
});
