import { describe, it, expect } from "vitest";
import { convertQuantity, BASE_UNIT_OPTIONS } from "./units.js";
import { AMBIGUOUS_PERCENT } from "./ambiguous.js";

describe("convertQuantity", () => {
  it("同一単位はそのまま", () => {
    expect(convertQuantity(250, "g", "g")).toBe(250);
    expect(convertQuantity(2, "個", "個")).toBe(2);
    expect(convertQuantity(3, "%", "%")).toBe(3);
  });

  it("kg→g / L→ml", () => {
    expect(convertQuantity(1.5, "kg", "g")).toBe(1500);
    expect(convertQuantity(0.5, "L", "ml")).toBe(500);
    expect(convertQuantity(2, "l", "ml")).toBe(2000);
  });

  it("逆方向(g→kg 管理など)や無関係な単位は null", () => {
    expect(convertQuantity(500, "g", "kg")).toBeNull();
    expect(convertQuantity(1, "個", "g")).toBeNull();
    expect(convertQuantity(1, "kg", "個")).toBeNull();
    expect(convertQuantity(1, "L", "g")).toBeNull();
  });

  describe("base_unit が % のとき", () => {
    it("曖昧表現の既定値", () => {
      expect(convertQuantity(1, "少々", "%")).toBe(1);
      expect(convertQuantity(1, "適量", "%")).toBe(3);
      expect(convertQuantity(1, "少量", "%")).toBe(3);
      expect(convertQuantity(1, "ひとつまみ", "%")).toBe(1);
    });

    it("表 AMBIGUOUS_PERCENT の全項目が変換できる", () => {
      for (const [word, pct] of Object.entries(AMBIGUOUS_PERCENT)) {
        expect(convertQuantity(1, word, "%")).toBe(pct);
      }
    });

    it("分数袋", () => {
      expect(convertQuantity(1, "1/4袋", "%")).toBe(25);
      expect(convertQuantity(1, "1/2袋", "%")).toBe(50);
      expect(convertQuantity(1, "1袋", "%")).toBe(100);
      expect(convertQuantity(1, "３/４袋", "%")).toBe(75); // 全角数字
      expect(convertQuantity(1, "1/3本", "%")).toBe(33.333);
    });

    it("N袋 / N本 / N個 は N*100", () => {
      expect(convertQuantity(2, "袋", "%")).toBe(200);
      expect(convertQuantity(0.5, "袋", "%")).toBe(50);
      expect(convertQuantity(3, "本", "%")).toBe(300);
      expect(convertQuantity(1.5, "個", "%")).toBe(150);
    });

    it("変換不能な単位は null", () => {
      expect(convertQuantity(100, "g", "%")).toBeNull();
      expect(convertQuantity(1, "パック", "%")).toBeNull();
      expect(convertQuantity(1, "1/0袋", "%")).toBeNull();
    });
  });

  it("% 以外の base_unit では曖昧表現・容器単位を変換しない", () => {
    expect(convertQuantity(1, "少々", "g")).toBeNull();
    expect(convertQuantity(1, "1/2袋", "個")).toBeNull();
    expect(convertQuantity(1, "袋", "g")).toBeNull();
  });

  it("不正な数量は null", () => {
    expect(convertQuantity(0, "g", "g")).toBeNull();
    expect(convertQuantity(-1, "g", "g")).toBeNull();
    expect(convertQuantity(NaN, "g", "g")).toBeNull();
    expect(convertQuantity(Infinity, "g", "g")).toBeNull();
  });

  it("前後の空白を無視する", () => {
    expect(convertQuantity(1, " kg ", "g")).toBe(1000);
  });

  it("base_unit 候補に % が含まれる", () => {
    expect(BASE_UNIT_OPTIONS).toContain("%");
  });
});
