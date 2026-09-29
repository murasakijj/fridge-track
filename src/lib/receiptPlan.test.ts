import { describe, it, expect } from "vitest";
import { planReceipt, type ReceiptRowInput } from "./receiptPlan";
import { mappingDocId, normalizeRawName } from "../../shared/receipt.js";

const now = new Date(2026, 8, 20, 15, 0, 0);
const today = new Date(2026, 8, 20);

function idGen() {
  let n = 0;
  return () => `id${++n}`;
}

const row = (o: Partial<ReceiptRowInput> = {}): ReceiptRowInput => ({
  rawName: "国産豚カタロース",
  foodItemId: "f1",
  newFood: null,
  quantity: 300,
  unit: "g",
  included: true,
  ...o,
});

describe("planReceipt", () => {
  it("含めた行ごとに Lot + PURCHASE を作り、マッピングと影響食材を出す", () => {
    const p = planReceipt(
      [
        row(),
        row({ rawName: "牛乳", foodItemId: "f2", quantity: 100, unit: "%" }),
      ],
      today,
      now,
      idGen(),
    );
    expect(p.lots).toHaveLength(2);
    expect(p.events).toEqual([
      { lot_id: p.lots[0]!.id, food_item_id: "f1", quantity_delta: 300 },
      { lot_id: p.lots[1]!.id, food_item_id: "f2", quantity_delta: 100 },
    ]);
    expect(p.receiptItems.every((i) => i.confirmed)).toBe(true);
    expect(p.mappings).toContainEqual({
      docId: mappingDocId(normalizeRawName("国産豚カタロース")),
      raw_name: normalizeRawName("国産豚カタロース"),
      food_item_id: "f1",
    });
    expect(p.affectedFoodIds.sort()).toEqual(["f1", "f2"]);
    // receipt 1 + items 2 + lots 2 + events 2 + mappings 2 + profiles 2
    expect(p.writeCount).toBe(11);
  });

  it("除外行は ReceiptItem(confirmed:false)だけ残し、在庫・マッピングを作らない", () => {
    const p = planReceipt(
      [
        row(),
        row({
          rawName: "レジ袋",
          included: false,
          quantity: null,
          foodItemId: null,
        }),
      ],
      today,
      now,
      idGen(),
    );
    expect(p.lots).toHaveLength(1);
    expect(p.receiptItems.map((i) => i.confirmed)).toEqual([true, false]);
    expect(p.receiptItems[1]!.quantity).toBe(0);
    expect(p.mappings).toHaveLength(1);
  });

  it("新規食材は同名同単位を 1 つにまとめる", () => {
    const nf = { name: "ネギ", base_unit: "本" };
    const p = planReceipt(
      [
        row({
          rawName: "ねぎ",
          foodItemId: null,
          newFood: nf,
          quantity: 1,
          unit: "本",
        }),
        row({
          rawName: "長ネギ",
          foodItemId: null,
          newFood: nf,
          quantity: 2,
          unit: "本",
        }),
      ],
      today,
      now,
      idGen(),
    );
    expect(p.newFoods).toHaveLength(1);
    expect(p.events.map((e) => e.food_item_id)).toEqual([
      p.newFoods[0]!.id,
      p.newFoods[0]!.id,
    ]);
    expect(p.lots).toHaveLength(2);
  });

  it("含めた行に食材・数量が無ければ row_incomplete", () => {
    const go = (r: Partial<ReceiptRowInput>) => () =>
      planReceipt([row(r)], today, now, idGen());
    expect(go({ foodItemId: null })).toThrow("row_incomplete");
    expect(go({ quantity: null })).toThrow("row_incomplete");
    expect(go({ quantity: 0 })).toThrow("row_incomplete");
    expect(go({ quantity: -2 })).toThrow("row_incomplete");
    expect(
      go({ foodItemId: null, newFood: { name: " ", base_unit: "個" } }),
    ).toThrow("row_incomplete");
  });

  it("未来の購入日・全行除外は拒否", () => {
    expect(() =>
      planReceipt([row()], new Date(2026, 8, 21), now, idGen()),
    ).toThrow("future_date");
    expect(() =>
      planReceipt([row({ included: false })], today, now, idGen()),
    ).toThrow("nothing_to_register");
  });

  it("書込みが 500 を超える場合は too_many_rows", () => {
    const rows = Array.from({ length: 120 }, (_, i) =>
      row({ rawName: `n${i}`, foodItemId: `f${i}` }),
    );
    expect(() => planReceipt(rows, today, now, idGen())).toThrow(
      "too_many_rows",
    );
  });

  it("購入日は今日なら現在時刻、過去日は正午", () => {
    expect(planReceipt([row()], today, now, idGen()).purchasedAt).toBe(now);
    expect(
      planReceipt([row()], new Date(2026, 8, 10), now, idGen()).purchasedAt,
    ).toEqual(new Date(2026, 8, 10, 12));
  });
});
