import { Timestamp, type DocumentData } from "firebase/firestore";
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  type EventType,
  type FoodItem,
  type InventoryEvent,
  type InventoryLot,
  type SourceType,
} from "../../shared/types.js";

/** QueryDocumentSnapshot の必要部分(テストしやすいよう構造的型にする)。 */
export interface DocLike {
  id: string;
  data(): DocumentData;
}

function warn(kind: string, id: string, reason: string): null {
  console.warn(`[inventory] skip malformed ${kind} ${id}: ${reason}`);
  return null;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * 不正なドキュメントは補正せず null を返す(呼び出し側でスキップ)。
 * 不正な値で在庫を計算すると誤った数量になるため、黙って型を合わせない。
 */
export function foodFromDoc(d: DocLike): FoodItem | null {
  const x = d.data();
  if (!nonEmptyString(x.name)) return warn("foodItem", d.id, "name");
  if (!nonEmptyString(x.base_unit)) return warn("foodItem", d.id, "base_unit");
  if (!(x.created_at instanceof Timestamp)) {
    return warn("foodItem", d.id, "created_at");
  }
  if (!(x.updated_at instanceof Timestamp)) {
    return warn("foodItem", d.id, "updated_at");
  }
  return {
    id: d.id,
    name: x.name,
    base_unit: x.base_unit,
    created_at: x.created_at.toDate(),
    updated_at: x.updated_at.toDate(),
  };
}

export function lotFromDoc(d: DocLike): InventoryLot | null {
  const x = d.data();
  if (!nonEmptyString(x.food_item_id)) {
    return warn("lot", d.id, "food_item_id");
  }
  if (!(x.purchased_at instanceof Timestamp)) {
    return warn("lot", d.id, "purchased_at");
  }
  if (!(x.created_at instanceof Timestamp)) {
    return warn("lot", d.id, "created_at");
  }
  if (!(x.updated_at instanceof Timestamp)) {
    return warn("lot", d.id, "updated_at");
  }
  return {
    id: d.id,
    food_item_id: x.food_item_id,
    purchased_at: x.purchased_at.toDate(),
    created_at: x.created_at.toDate(),
    updated_at: x.updated_at.toDate(),
  };
}

export function eventFromDoc(d: DocLike): InventoryEvent | null {
  const x = d.data();
  if (!(EVENT_TYPES as readonly unknown[]).includes(x.event_type)) {
    return warn("event", d.id, "event_type");
  }
  if (!(SOURCE_TYPES as readonly unknown[]).includes(x.source_type)) {
    return warn("event", d.id, "source_type");
  }
  if (!nonEmptyString(x.inventory_lot_id)) {
    return warn("event", d.id, "inventory_lot_id");
  }
  if (!nonEmptyString(x.food_item_id)) {
    return warn("event", d.id, "food_item_id");
  }
  if (
    typeof x.quantity_delta !== "number" ||
    !Number.isFinite(x.quantity_delta)
  ) {
    return warn("event", d.id, "quantity_delta");
  }
  if (!(x.occurred_at instanceof Timestamp)) {
    return warn("event", d.id, "occurred_at");
  }
  if (!(x.created_at instanceof Timestamp)) {
    return warn("event", d.id, "created_at");
  }
  return {
    id: d.id,
    inventory_lot_id: x.inventory_lot_id,
    food_item_id: x.food_item_id,
    event_type: x.event_type as EventType,
    quantity_delta: x.quantity_delta,
    source_type: x.source_type as SourceType,
    source_id: typeof x.source_id === "string" ? x.source_id : null,
    occurred_at: x.occurred_at.toDate(),
    created_at: x.created_at.toDate(),
    ...(typeof x.note === "string" && x.note ? { note: x.note } : {}),
  };
}

/** null(不正ドキュメント)を除いて変換する。 */
export function convertDocs<T>(
  docs: readonly DocLike[],
  convert: (d: DocLike) => T | null,
): T[] {
  const out: T[] = [];
  for (const d of docs) {
    const v = convert(d);
    if (v !== null) out.push(v);
  }
  return out;
}
