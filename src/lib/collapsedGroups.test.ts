import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadCollapsed,
  parseCollapsed,
  saveCollapsed,
  serializeCollapsed,
} from "./collapsedGroups";

afterEach(() => vi.unstubAllGlobals());

describe("collapsedGroups", () => {
  it("往復できる(順序は表示順に正規化)", () => {
    const s = serializeCollapsed(
      new Set(["seasoning", "uncategorized", "fruit"]),
    );
    expect(JSON.parse(s)).toEqual(["fruit", "seasoning", "uncategorized"]);
    expect([...parseCollapsed(s)].sort()).toEqual(
      ["fruit", "seasoning", "uncategorized"].sort(),
    );
  });
  it("壊れた値・未知キーは無視", () => {
    expect(parseCollapsed(null).size).toBe(0);
    expect(parseCollapsed("").size).toBe(0);
    expect(parseCollapsed("{not json").size).toBe(0);
    expect(parseCollapsed('{"a":1}').size).toBe(0);
    expect([...parseCollapsed('["fruit","bogus",3]')]).toEqual(["fruit"]);
  });
  it("localStorage が例外でも落ちない", () => {
    const boom = () => {
      throw new Error("denied");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom });
    expect(loadCollapsed().size).toBe(0);
    expect(() => saveCollapsed(new Set(["fruit"]))).not.toThrow();
  });
  it("localStorage が無い環境でも落ちない", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(loadCollapsed().size).toBe(0);
    expect(() => saveCollapsed(new Set())).not.toThrow();
  });
  it("保存した値を読み戻せる", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    saveCollapsed(new Set(["meat_fish"]));
    expect([...loadCollapsed()]).toEqual(["meat_fish"]);
  });
});
