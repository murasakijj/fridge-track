/**
 * ドメイン型。フロントエンド(src/)と API(api/)で共用する純粋な型定義。
 * 日時は Date で表現する(Firestore Timestamp との変換は境界側で行う)。
 * 数量(在庫量)は FoodItem / InventoryLot に持たせない。InventoryEvent の
 * quantity_delta の合計からのみ算出する(仕様 §13)。
 */

export const EVENT_TYPES = [
  "PURCHASE",
  "CONSUME",
  "DISCARD",
  "ADJUST",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SOURCE_TYPES = ["MANUAL", "RECIPE", "RECEIPT", "SYSTEM"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface FoodItem {
  id: string;
  name: string;
  /** 管理単位。作成後は変更不可。 */
  base_unit: string;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryLot {
  id: string;
  food_item_id: string;
  purchased_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryEvent {
  id: string;
  inventory_lot_id: string;
  food_item_id: string;
  event_type: EventType;
  quantity_delta: number;
  source_type: SourceType;
  source_id: string | null;
  occurred_at: Date;
  created_at: Date;
  note?: string;
}

/** 数量計算に必要な最小限の Lot 形(順序付けに使う)。 */
export type LotLike = Pick<InventoryLot, "id" | "purchased_at" | "created_at">;

/** 数量計算に必要な最小限のイベント形。 */
export type EventLike = Pick<
  InventoryEvent,
  "inventory_lot_id" | "quantity_delta"
>;

/** 1 つの Lot に対して作るイベントの差分(向き付き)。 */
export interface Allocation {
  lotId: string;
  delta: number;
}
