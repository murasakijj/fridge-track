import {
  getFirestore,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { getFirebaseApp } from "../auth.js";
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  type InventoryEvent,
  type InventoryLot,
} from "../../../shared/types.js";
import type {
  ConsumeTx,
  EventDoc,
  ProfileDoc,
  ResultDoc,
} from "./recipeConsume.js";

function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

function toDate(v: unknown): Date | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate() : null;
}

function lotFrom(id: string, x: DocumentData): InventoryLot | null {
  const purchased = toDate(x.purchased_at);
  const created = toDate(x.created_at);
  const updated = toDate(x.updated_at);
  if (
    typeof x.food_item_id !== "string" ||
    !purchased ||
    !created ||
    !updated
  ) {
    console.warn(`[store] skip malformed lot ${id}`);
    return null;
  }
  return {
    id,
    food_item_id: x.food_item_id,
    purchased_at: purchased,
    created_at: created,
    updated_at: updated,
  };
}

function eventFrom(id: string, x: DocumentData): InventoryEvent | null {
  const occurred = toDate(x.occurred_at);
  const created = toDate(x.created_at);
  if (
    !(EVENT_TYPES as readonly unknown[]).includes(x.event_type) ||
    !(SOURCE_TYPES as readonly unknown[]).includes(x.source_type) ||
    typeof x.inventory_lot_id !== "string" ||
    typeof x.food_item_id !== "string" ||
    typeof x.quantity_delta !== "number" ||
    !Number.isFinite(x.quantity_delta) ||
    !occurred ||
    !created
  ) {
    console.warn(`[store] skip malformed event ${id}`);
    return null;
  }
  return {
    id,
    inventory_lot_id: x.inventory_lot_id,
    food_item_id: x.food_item_id,
    event_type: x.event_type,
    quantity_delta: x.quantity_delta,
    source_type: x.source_type,
    source_id: typeof x.source_id === "string" ? x.source_id : null,
    occurred_at: occurred,
    created_at: created,
  };
}

function txFor(db: Firestore, t: Transaction, uid: string): ConsumeTx {
  const col = (name: string) =>
    db.collection("users").doc(uid).collection(name);
  return {
    async getResult(id) {
      const snap = await t.get(col("recipeConsumptions").doc(id));
      if (!snap.exists) return null;
      const x = snap.data() as DocumentData;
      return {
        recipe_id: String(x.recipe_id ?? ""),
        created_at: toDate(x.created_at) ?? new Date(0),
        event_ids: Array.isArray(x.event_ids) ? x.event_ids : [],
        results: Array.isArray(x.results) ? x.results : [],
      };
    },
    async getFood(id) {
      const snap = await t.get(col("foodItems").doc(id));
      const unit = snap.exists ? snap.data()?.base_unit : undefined;
      return typeof unit === "string" && unit ? { base_unit: unit } : null;
    },
    async getLots(foodId) {
      const snap = await t.get(
        col("inventoryLots").where("food_item_id", "==", foodId),
      );
      return snap.docs.flatMap((d) => lotFrom(d.id, d.data()) ?? []);
    },
    async getEvents(foodId) {
      const snap = await t.get(
        col("inventoryEvents").where("food_item_id", "==", foodId),
      );
      return snap.docs.flatMap((d) => eventFrom(d.id, d.data()) ?? []);
    },
    createEvent(doc: EventDoc) {
      const ref = col("inventoryEvents").doc();
      t.create(ref, { ...doc });
      return ref.id;
    },
    setProfile(foodId: string, doc: ProfileDoc) {
      t.set(col("consumptionProfiles").doc(foodId), { ...doc });
    },
    setResult(id: string, doc: ResultDoc) {
      t.set(col("recipeConsumptions").doc(id), { ...doc });
    },
  };
}

/** firebase-admin のトランザクション内で fn を実行する(競合時は fn が再実行される)。 */
export function runInOwnerTransaction<T>(
  uid: string,
  fn: (tx: ConsumeTx) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.runTransaction((t) => fn(txFor(db, t, uid)));
}

/** 連携用: 食材一覧。 */
export async function listFoodItems(
  uid: string,
): Promise<{ id: string; name: string; base_unit: string }[]> {
  const snap = await getDb()
    .collection("users")
    .doc(uid)
    .collection("foodItems")
    .get();
  const out: { id: string; name: string; base_unit: string }[] = [];
  for (const d of snap.docs) {
    const x = d.data();
    if (typeof x.name === "string" && typeof x.base_unit === "string") {
      out.push({ id: d.id, name: x.name, base_unit: x.base_unit });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
