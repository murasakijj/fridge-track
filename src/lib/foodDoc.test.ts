import { describe, it, expect } from "vitest";
import { newFoodDoc } from "./foodDoc";

describe("newFoodDoc", () => {
  const base = { name: "牛乳", base_unit: "%" };
  it("カテゴリ無し(null/未指定/未知)は category キーを含めない", () => {
    for (const category of [null, undefined, "", "bogus"]) {
      const d = newFoodDoc({ ...base, category }, 1);
      expect(Object.keys(d).sort()).toEqual([
        "base_unit",
        "created_at",
        "name",
        "updated_at",
      ]);
    }
  });
  it("既知のカテゴリは含める", () => {
    expect(newFoodDoc({ ...base, category: "egg_dairy" }, 1)).toEqual({
      ...base,
      category: "egg_dairy",
      created_at: 1,
      updated_at: 1,
    });
  });
});
