import { describe, it, expect } from "vitest";
import { isFuturePurchaseDate, purchasedAtFor } from "./purchaseDate";

describe("purchasedAtFor", () => {
  const now = new Date(2026, 5, 10, 18, 30, 15);

  it("今日なら現在時刻をそのまま使う", () => {
    expect(purchasedAtFor(new Date(2026, 5, 10), now)).toBe(now);
  });

  it("過去日はその日の正午(ローカル)", () => {
    const r = purchasedAtFor(new Date(2026, 5, 3), now);
    expect(r).toEqual(new Date(2026, 5, 3, 12, 0, 0));
  });

  it("月・年をまたいでも日付単位で判定する", () => {
    expect(purchasedAtFor(new Date(2025, 5, 10), now)).toEqual(
      new Date(2025, 5, 10, 12),
    );
  });
});

describe("isFuturePurchaseDate", () => {
  const now = new Date(2026, 5, 10, 0, 0, 1);
  it("今日・過去は false", () => {
    expect(isFuturePurchaseDate(new Date(2026, 5, 10), now)).toBe(false);
    expect(isFuturePurchaseDate(new Date(2026, 5, 9), now)).toBe(false);
  });
  it("明日以降は true", () => {
    expect(isFuturePurchaseDate(new Date(2026, 5, 11), now)).toBe(true);
    expect(isFuturePurchaseDate(new Date(2027, 0, 1), now)).toBe(true);
  });
});
