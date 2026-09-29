import { describe, it, expect, vi, beforeEach } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  convertDocs,
  eventFromDoc,
  foodFromDoc,
  lotFromDoc,
  mappingFromDoc,
  type DocLike,
} from "./inventoryData";

const ts = (ms: number) => Timestamp.fromMillis(ms);
const docOf = (id: string, data: Record<string, unknown>): DocLike => ({
  id,
  data: () => data,
});

const goodEvent = {
  inventory_lot_id: "L1",
  food_item_id: "F1",
  event_type: "CONSUME",
  quantity_delta: -5,
  source_type: "MANUAL",
  source_id: null,
  occurred_at: ts(2000),
  created_at: ts(3000),
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("eventFromDoc", () => {
  it("正常なドキュメントを変換する", () => {
    const e = eventFromDoc(docOf("e1", { ...goodEvent, note: "メモ" }));
    expect(e).toEqual({
      id: "e1",
      inventory_lot_id: "L1",
      food_item_id: "F1",
      event_type: "CONSUME",
      quantity_delta: -5,
      source_type: "MANUAL",
      source_id: null,
      occurred_at: new Date(2000),
      created_at: new Date(3000),
      note: "メモ",
    });
  });

  it("未知の event_type / source_type は補正せず null + warn", () => {
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, event_type: "FOO" })),
    ).toBeNull();
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, source_type: "X" })),
    ).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("タイムスタンプ欠落・数量不正・ID 欠落は null", () => {
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, occurred_at: null })),
    ).toBeNull();
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, created_at: undefined })),
    ).toBeNull();
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, quantity_delta: "5" })),
    ).toBeNull();
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, quantity_delta: NaN })),
    ).toBeNull();
    expect(
      eventFromDoc(docOf("e", { ...goodEvent, inventory_lot_id: "" })),
    ).toBeNull();
  });

  it("source_id が文字列ならそのまま保持する", () => {
    const e = eventFromDoc(docOf("e", { ...goodEvent, source_id: "cook1" }));
    expect(e?.source_id).toBe("cook1");
  });
});

describe("foodFromDoc / lotFromDoc", () => {
  it("正常変換", () => {
    expect(
      foodFromDoc(
        docOf("f", {
          name: "牛乳",
          base_unit: "%",
          created_at: ts(1),
          updated_at: ts(2),
        }),
      ),
    ).toMatchObject({ id: "f", name: "牛乳", base_unit: "%" });
    expect(
      lotFromDoc(
        docOf("l", {
          food_item_id: "f",
          purchased_at: ts(1),
          created_at: ts(2),
          updated_at: ts(3),
        }),
      ),
    ).toMatchObject({ id: "l", food_item_id: "f" });
  });

  it("不正は null", () => {
    expect(
      foodFromDoc(
        docOf("f", {
          name: "",
          base_unit: "%",
          created_at: ts(1),
          updated_at: ts(1),
        }),
      ),
    ).toBeNull();
    expect(
      foodFromDoc(docOf("f", { name: "a", base_unit: "%", created_at: ts(1) })),
    ).toBeNull();
    expect(
      lotFromDoc(docOf("l", { food_item_id: "f", purchased_at: null })),
    ).toBeNull();
  });
});

describe("convertDocs", () => {
  it("不正なドキュメントだけをスキップする", () => {
    const docs = [
      docOf("ok", goodEvent),
      docOf("bad", { ...goodEvent, event_type: "??" }),
    ];
    const r = convertDocs(docs, eventFromDoc);
    expect(r.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("mappingFromDoc", () => {
  it("正常変換と不正の除外", () => {
    const good = {
      raw_name: "牛乳",
      food_item_id: "f1",
      created_at: ts(1),
      updated_at: ts(2),
    };
    expect(mappingFromDoc(docOf("m", good))).toMatchObject({
      id: "m",
      raw_name: "牛乳",
      food_item_id: "f1",
    });
    expect(mappingFromDoc(docOf("m", { ...good, raw_name: "" }))).toBeNull();
    expect(
      mappingFromDoc(docOf("m", { ...good, updated_at: null })),
    ).toBeNull();
  });
});
