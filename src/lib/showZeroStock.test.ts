import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadShowZero,
  parseShowZero,
  saveShowZero,
  serializeShowZero,
} from "./showZeroStock";

afterEach(() => vi.unstubAllGlobals());

describe("showZeroStock", () => {
  it("往復でき、壊れた値・未設定は非表示", () => {
    expect(parseShowZero(serializeShowZero(true))).toBe(true);
    expect(parseShowZero(serializeShowZero(false))).toBe(false);
    expect(parseShowZero(null)).toBe(false);
    expect(parseShowZero("true")).toBe(false);
  });
  it("localStorage が例外でも落ちず既定は非表示", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    expect(loadShowZero()).toBe(false);
    expect(() => saveShowZero(true)).not.toThrow();
  });
  it("保存した値を読み戻せる", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(loadShowZero()).toBe(false);
    saveShowZero(true);
    expect(loadShowZero()).toBe(true);
  });
});
