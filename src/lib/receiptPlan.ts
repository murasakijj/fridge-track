import { roundQty } from "../../shared/qty.js";
import { mappingDocId, normalizeRawName } from "../../shared/receipt.js";
import { isFuturePurchaseDate, purchasedAtFor } from "./purchaseDate";

/** 1 行分の確定入力。数量は対象食材の base_unit 換算済み。 */
export interface ReceiptRowInput {
  rawName: string;
  /** 既存食材の id(newFood と排他)。 */
  foodItemId: string | null;
  /** 新規作成する食材。 */
  newFood: { name: string; base_unit: string } | null;
  quantity: number | null;
  /** 明細に残す単位(食材の base_unit)。 */
  unit: string;
  included: boolean;
}

export interface ReceiptPlan {
  receiptId: string;
  purchasedAt: Date;
  newFoods: { id: string; name: string; base_unit: string }[];
  receiptItems: {
    id: string;
    raw_name: string;
    food_item_id: string | null;
    quantity: number;
    unit: string;
    confirmed: boolean;
  }[];
  lots: { id: string; food_item_id: string }[];
  events: {
    lot_id: string;
    food_item_id: string;
    quantity_delta: number;
  }[];
  mappings: { docId: string; raw_name: string; food_item_id: string }[];
  /** 影響を受ける食材(プロファイル再計算対象)。 */
  affectedFoodIds: string[];
  /** batch の書込み数(Firestore 上限 500 の確認用)。 */
  writeCount: number;
}

export const MAX_BATCH_WRITES = 500;

/**
 * 確定入力から書込み内容を組み立てる(Firestore には触れない純粋関数)。
 * 例外コード: future_date / nothing_to_register / row_incomplete / too_many_rows
 * ユーザーが確認・確定した行だけが在庫になる(included=false は ReceiptItem に
 * confirmed:false で残すのみ)。
 */
export function planReceipt(
  rows: readonly ReceiptRowInput[],
  purchaseDate: Date,
  now: Date,
  newId: () => string,
): ReceiptPlan {
  if (isFuturePurchaseDate(purchaseDate, now)) throw new Error("future_date");
  if (!rows.some((r) => r.included)) throw new Error("nothing_to_register");

  const purchasedAt = purchasedAtFor(purchaseDate, now);
  const receiptId = newId();

  // 同名(+同単位)の新規食材は 1 つにまとめる。
  const newFoodIds = new Map<string, string>();
  const newFoods: ReceiptPlan["newFoods"] = [];
  const plan: ReceiptPlan = {
    receiptId,
    purchasedAt,
    newFoods,
    receiptItems: [],
    lots: [],
    events: [],
    mappings: [],
    affectedFoodIds: [],
    writeCount: 0,
  };
  const mappingById = new Map<string, ReceiptPlan["mappings"][number]>();
  const affected = new Set<string>();

  for (const row of rows) {
    let foodId: string | null = row.foodItemId;
    if (!foodId && row.newFood && row.included) {
      const name = row.newFood.name.trim();
      const unit = row.newFood.base_unit.trim();
      if (!name || !unit) throw new Error("row_incomplete");
      const k = `${name}\u0000${unit}`;
      let id = newFoodIds.get(k);
      if (!id) {
        id = newId();
        newFoodIds.set(k, id);
        newFoods.push({ id, name, base_unit: unit });
      }
      foodId = id;
    }

    let quantity = row.quantity !== null ? roundQty(row.quantity) : 0;
    if (row.included) {
      if (!foodId || !(quantity > 0) || !Number.isFinite(quantity)) {
        throw new Error("row_incomplete");
      }
    } else if (!Number.isFinite(quantity) || quantity < 0) {
      quantity = 0;
    }

    plan.receiptItems.push({
      id: newId(),
      raw_name: row.rawName,
      food_item_id: row.included ? foodId : (row.foodItemId ?? null),
      quantity,
      unit: row.unit,
      confirmed: row.included,
    });

    if (row.included && foodId) {
      const lotId = newId();
      plan.lots.push({ id: lotId, food_item_id: foodId });
      plan.events.push({
        lot_id: lotId,
        food_item_id: foodId,
        quantity_delta: quantity,
      });
      affected.add(foodId);
      const normalized = normalizeRawName(row.rawName);
      if (normalized) {
        const docId = mappingDocId(normalized);
        mappingById.set(docId, {
          docId,
          raw_name: normalized,
          food_item_id: foodId,
        });
      }
    }
  }

  plan.mappings = [...mappingById.values()];
  plan.affectedFoodIds = [...affected];
  plan.writeCount =
    1 + // receipt
    plan.receiptItems.length +
    plan.newFoods.length +
    plan.lots.length +
    plan.events.length +
    plan.mappings.length +
    plan.affectedFoodIds.length; // consumptionProfiles
  if (plan.writeCount > MAX_BATCH_WRITES) throw new Error("too_many_rows");
  return plan;
}
