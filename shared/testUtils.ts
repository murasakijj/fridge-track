import type { InventoryEvent, InventoryLot } from "./types.js";

/** テスト用: 基準日から d 日後(0 時 UTC)。 */
export function day(d: number, hours = 0): Date {
  return new Date(Date.UTC(2026, 0, 1) + d * 86400000 + hours * 3600000);
}

let seq = 0;

export function lot(
  id: string,
  purchasedDay: number,
  extra: Partial<InventoryLot> = {},
): InventoryLot {
  return {
    id,
    food_item_id: "f1",
    purchased_at: day(purchasedDay),
    created_at: day(purchasedDay),
    updated_at: day(purchasedDay),
    ...extra,
  };
}

export function ev(
  lotId: string,
  type: InventoryEvent["event_type"],
  delta: number,
  atDay: number,
  extra: Partial<InventoryEvent> = {},
): InventoryEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    inventory_lot_id: lotId,
    food_item_id: "f1",
    event_type: type,
    quantity_delta: delta,
    source_type: "MANUAL",
    source_id: null,
    occurred_at: day(atDay),
    created_at: day(atDay),
    ...extra,
  };
}
