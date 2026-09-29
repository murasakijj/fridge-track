import { describe, it, expect, vi } from "vitest";
import {
  executeRecipeConsume,
  recipeConsumeRequestSchema,
  type ConsumeTx,
  type EventDoc,
  type ProfileDoc,
  type ResultDoc,
} from "./recipeConsume.js";
import { requireOwner, tokensEqual } from "./ownerAuth.js";
import { AuthError } from "../auth.js";
import { day, lot, ev } from "../../../shared/testUtils.js";
import type { InventoryEvent, InventoryLot } from "../../../shared/types.js";

class FakeTx implements ConsumeTx {
  results = new Map<string, ResultDoc>();
  foods = new Map<string, { base_unit: string }>();
  lots: InventoryLot[] = [];
  events: InventoryEvent[] = [];
  created: EventDoc[] = [];
  profiles = new Map<string, ProfileDoc>();
  writesBeforeReadsDone = false;
  private wrote = false;
  private readAfterWrite = false;

  async getResult(id: string) {
    this.noteRead();
    return this.results.get(id) ?? null;
  }
  async getFood(id: string) {
    this.noteRead();
    return this.foods.get(id) ?? null;
  }
  async getLots(foodId: string) {
    this.noteRead();
    return this.lots.filter((l) => l.food_item_id === foodId);
  }
  async getEvents(foodId: string) {
    this.noteRead();
    return this.events.filter((e) => e.food_item_id === foodId);
  }
  createEvent(doc: EventDoc) {
    this.wrote = true;
    this.created.push(doc);
    return `new-${this.created.length}`;
  }
  setProfile(foodId: string, doc: ProfileDoc) {
    this.wrote = true;
    this.profiles.set(foodId, doc);
  }
  setResult(id: string, doc: ResultDoc) {
    this.wrote = true;
    this.results.set(id, doc);
  }
  private noteRead() {
    if (this.wrote) this.readAfterWrite = true;
  }
  get violatedReadBeforeWrite() {
    return this.readAfterWrite;
  }
}

/** 牛乳(%): Lot A 30 / Lot B 100。豚肉(g): Lot C 500。 */
function seeded(): FakeTx {
  const tx = new FakeTx();
  tx.foods.set("milk", { base_unit: "%" });
  tx.foods.set("pork", { base_unit: "g" });
  tx.lots = [
    lot("A", 0, { food_item_id: "milk" }),
    lot("B", 1, { food_item_id: "milk" }),
    lot("C", 0, { food_item_id: "pork" }),
  ];
  tx.events = [
    ev("A", "PURCHASE", 30, 0, { food_item_id: "milk" }),
    ev("B", "PURCHASE", 100, 1, { food_item_id: "milk" }),
    ev("C", "PURCHASE", 500, 0, { food_item_id: "pork" }),
  ];
  return tx;
}

const NOW = day(5);

function input(
  items: { food_item_id: string; quantity: number; unit: string }[],
) {
  return recipeConsumeRequestSchema.parse({
    recipe_id: "r1",
    cooking_event_id: "cook1",
    items,
  });
}

describe("executeRecipeConsume", () => {
  it("FIFO で複数 Lot に CONSUME(RECIPE)を作り、結果を保存する(30/100 から 50 → -30/-20)", async () => {
    const tx = seeded();
    const out = await executeRecipeConsume(
      tx,
      input([{ food_item_id: "milk", quantity: 50, unit: "%" }]),
      NOW,
    );
    expect(out.replayed).toBe(false);
    expect(out.results).toEqual([
      { food_item_id: "milk", consumed: 50, shortage: 0 },
    ]);
    expect(
      tx.created.map((e) => [e.inventory_lot_id, e.quantity_delta]),
    ).toEqual([
      ["A", -30],
      ["B", -20],
    ]);
    for (const e of tx.created) {
      expect(e.event_type).toBe("CONSUME");
      expect(e.source_type).toBe("RECIPE");
      expect(e.source_id).toBe("cook1");
      expect(e.note).toBe("recipe:r1");
    }
    expect(tx.results.get("cook1")?.event_ids).toEqual(["new-1", "new-2"]);
    expect(tx.profiles.get("milk")?.observation_count).toBe(2);
    expect(tx.violatedReadBeforeWrite).toBe(false);
  });

  it("作るイベントの形が firestore.rules の許可キー・符号条件を満たす", async () => {
    const tx = seeded();
    await executeRecipeConsume(
      tx,
      input([{ food_item_id: "pork", quantity: 100, unit: "g" }]),
      NOW,
    );
    const allowed = new Set([
      "inventory_lot_id",
      "food_item_id",
      "event_type",
      "quantity_delta",
      "source_type",
      "source_id",
      "occurred_at",
      "created_at",
      "note",
    ]);
    const required = [
      "inventory_lot_id",
      "food_item_id",
      "event_type",
      "quantity_delta",
      "source_type",
      "source_id",
      "occurred_at",
      "created_at",
    ];
    const e = tx.created[0]!;
    expect(Object.keys(e).every((k) => allowed.has(k))).toBe(true);
    expect(required.every((k) => k in e)).toBe(true);
    expect(e.quantity_delta).toBeLessThan(0);
    expect(e.occurred_at).toBeInstanceOf(Date);
    expect(e.created_at).toBeInstanceOf(Date);
  });

  it("冪等: 同じ cooking_event_id の再送は前回結果を返し、何も書かない", async () => {
    const tx = seeded();
    const first = await executeRecipeConsume(
      tx,
      input([{ food_item_id: "milk", quantity: 50, unit: "%" }]),
      NOW,
    );
    const createdCount = tx.created.length;
    const second = await executeRecipeConsume(
      tx,
      input([{ food_item_id: "milk", quantity: 999, unit: "%" }]),
      day(6),
    );
    expect(second.replayed).toBe(true);
    expect(second.results).toEqual(first.results);
    expect(tx.created).toHaveLength(createdCount);
  });

  it("単位変換: kg→g、N袋→%", async () => {
    const tx = seeded();
    const out = await executeRecipeConsume(
      tx,
      input([
        { food_item_id: "pork", quantity: 0.25, unit: "kg" },
        { food_item_id: "milk", quantity: 0.5, unit: "袋" },
      ]),
      NOW,
    );
    expect(out.results).toEqual([
      { food_item_id: "pork", consumed: 250, shortage: 0 },
      { food_item_id: "milk", consumed: 50, shortage: 0 },
    ]);
  });

  it("unit_mismatch / not_found は該当明細だけエラーにし、他は処理する", async () => {
    const tx = seeded();
    const out = await executeRecipeConsume(
      tx,
      input([
        { food_item_id: "pork", quantity: 2, unit: "個" },
        { food_item_id: "ghost", quantity: 1, unit: "個" },
        { food_item_id: "milk", quantity: 10, unit: "%" },
      ]),
      NOW,
    );
    expect(out.results).toEqual([
      {
        food_item_id: "pork",
        consumed: 0,
        shortage: 0,
        error: "unit_mismatch",
      },
      { food_item_id: "ghost", consumed: 0, shortage: 0, error: "not_found" },
      { food_item_id: "milk", consumed: 10, shortage: 0 },
    ]);
    expect(tx.created).toHaveLength(1);
  });

  it("在庫不足は不足分を shortage として返し、残量までしか記録しない", async () => {
    const tx = seeded();
    const out = await executeRecipeConsume(
      tx,
      input([{ food_item_id: "pork", quantity: 800, unit: "g" }]),
      NOW,
    );
    expect(out.results[0]).toEqual({
      food_item_id: "pork",
      consumed: 500,
      shortage: 300,
    });
  });

  it("在庫ゼロなら記録なし・全量 shortage", async () => {
    const tx = seeded();
    tx.events = [];
    const out = await executeRecipeConsume(
      tx,
      input([{ food_item_id: "pork", quantity: 100, unit: "g" }]),
      NOW,
    );
    expect(out.results[0]).toEqual({
      food_item_id: "pork",
      consumed: 0,
      shortage: 100,
    });
    expect(tx.created).toHaveLength(0);
  });

  it("同じ食材が複数行あっても先行分を踏まえて FIFO する", async () => {
    const tx = seeded();
    const out = await executeRecipeConsume(
      tx,
      input([
        { food_item_id: "milk", quantity: 20, unit: "%" },
        { food_item_id: "milk", quantity: 20, unit: "%" },
      ]),
      NOW,
    );
    expect(out.results.map((r) => r.consumed)).toEqual([20, 20]);
    // Lot A(30): 20 + 10、Lot B: 10
    expect(
      tx.created.map((e) => [e.inventory_lot_id, e.quantity_delta]),
    ).toEqual([
      ["A", -20],
      ["A", -10],
      ["B", -10],
    ]);
  });
});

describe("recipeConsumeRequestSchema", () => {
  const base = {
    recipe_id: "r",
    cooking_event_id: "c1",
    items: [{ food_item_id: "f", quantity: 1, unit: "g" }],
  };
  it("正常", () => {
    expect(recipeConsumeRequestSchema.safeParse(base).success).toBe(true);
  });
  it("不正: items 空 / 101 件 / 数量 0 / 不正な cooking_event_id", () => {
    const bad = (o: object) =>
      recipeConsumeRequestSchema.safeParse({ ...base, ...o }).success;
    expect(bad({ items: [] })).toBe(false);
    expect(
      bad({ items: Array.from({ length: 101 }, () => base.items[0]) }),
    ).toBe(false);
    expect(bad({ items: [{ ...base.items[0], quantity: 0 }] })).toBe(false);
    expect(bad({ items: [{ ...base.items[0], quantity: -1 }] })).toBe(false);
    expect(bad({ cooking_event_id: "a/b" })).toBe(false);
    expect(bad({ cooking_event_id: ".." })).toBe(false);
    expect(bad({ cooking_event_id: "__x__" })).toBe(false);
    expect(bad({ recipe_id: "" })).toBe(false);
  });
});

describe("requireOwner", () => {
  const TOKEN = "t".repeat(40);
  const env = {
    RECIPE_INTEGRATION_TOKEN: TOKEN,
    INVENTORY_OWNER_UID: "owner1",
  };

  it("連携トークン一致なら INVENTORY_OWNER_UID を返し、ID トークン検証は呼ばない", async () => {
    const verify = vi.fn();
    await expect(
      requireOwner(`Bearer ${TOKEN}`, { env, requireAuth: verify }),
    ).resolves.toEqual({ uid: "owner1", via: "integration_token" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("トークン不一致なら ID トークンとして検証する(失敗は AuthError)", async () => {
    const verify = vi.fn(async () => {
      throw new AuthError(401, "invalid_token");
    });
    await expect(
      requireOwner(`Bearer ${"x".repeat(40)}`, { env, requireAuth: verify }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(verify).toHaveBeenCalled();
  });

  it("ID トークンが有効ならその uid", async () => {
    const verify = vi.fn(async () => ({ uid: "u9", email: "a@b" }));
    await expect(
      requireOwner("Bearer idtoken", { env, requireAuth: verify }),
    ).resolves.toEqual({ uid: "u9", via: "firebase" });
  });

  it("RECIPE_INTEGRATION_TOKEN 未設定・32 文字未満なら連携トークン経路は無効", async () => {
    for (const t of [undefined, "short-token"]) {
      const verify = vi.fn(async () => {
        throw new AuthError(401, "invalid_token");
      });
      await expect(
        requireOwner(`Bearer ${t ?? "anything"}`, {
          env: { RECIPE_INTEGRATION_TOKEN: t, INVENTORY_OWNER_UID: "owner1" },
          requireAuth: verify,
        }),
      ).rejects.toBeInstanceOf(AuthError);
      expect(verify).toHaveBeenCalled();
    }
  });

  it("トークン一致でも INVENTORY_OWNER_UID 未設定は設定エラー", async () => {
    await expect(
      requireOwner(`Bearer ${TOKEN}`, {
        env: { RECIPE_INTEGRATION_TOKEN: TOKEN },
        requireAuth: vi.fn(),
      }),
    ).rejects.toThrow("INVENTORY_OWNER_UID");
  });

  it("Authorization 無しは requireAuth に委ねる(401)", async () => {
    const verify = vi.fn(async () => {
      throw new AuthError(401, "missing_token");
    });
    await expect(
      requireOwner(undefined, { env, requireAuth: verify }),
    ).rejects.toMatchObject({ message: "missing_token" });
  });
});

describe("tokensEqual", () => {
  it("同一のみ true(長さ違いでも例外にならない)", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "abcd")).toBe(false);
  });
});
