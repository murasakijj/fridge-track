import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  type EventType,
  type FoodItem,
  type InventoryEvent,
  type InventoryLot,
  type SourceType,
} from "../../shared/types.js";

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  // serverTimestamp の保留中などで null になり得る。
  return new Date();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function foodFromDoc(d: QueryDocumentSnapshot<DocumentData>): FoodItem {
  const x = d.data();
  return {
    id: d.id,
    name: str(x.name),
    base_unit: str(x.base_unit),
    created_at: toDate(x.created_at),
    updated_at: toDate(x.updated_at),
  };
}

export function lotFromDoc(
  d: QueryDocumentSnapshot<DocumentData>,
): InventoryLot {
  const x = d.data();
  return {
    id: d.id,
    food_item_id: str(x.food_item_id),
    purchased_at: toDate(x.purchased_at),
    created_at: toDate(x.created_at),
    updated_at: toDate(x.updated_at),
  };
}

export function eventFromDoc(
  d: QueryDocumentSnapshot<DocumentData>,
): InventoryEvent {
  const x = d.data();
  const eventType = (EVENT_TYPES as readonly string[]).includes(x.event_type)
    ? (x.event_type as EventType)
    : "ADJUST";
  const sourceType = (SOURCE_TYPES as readonly string[]).includes(x.source_type)
    ? (x.source_type as SourceType)
    : "SYSTEM";
  return {
    id: d.id,
    inventory_lot_id: str(x.inventory_lot_id),
    food_item_id: str(x.food_item_id),
    event_type: eventType,
    quantity_delta: typeof x.quantity_delta === "number" ? x.quantity_delta : 0,
    source_type: sourceType,
    source_id: typeof x.source_id === "string" ? x.source_id : null,
    occurred_at: toDate(x.occurred_at),
    created_at: toDate(x.created_at),
    ...(typeof x.note === "string" && x.note ? { note: x.note } : {}),
  };
}
