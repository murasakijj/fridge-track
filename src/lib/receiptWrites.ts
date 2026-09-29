import { Timestamp, collection, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { commitBatch } from "./inventoryWrites";
import { planReceipt, type ReceiptRowInput } from "./receiptPlan";
import { computeConsumptionProfile } from "../../shared/consumption.js";
import type { InventoryEvent, ReceiptFoodMapping } from "../../shared/types.js";

/**
 * ユーザーが確認・確定した行だけを 1 つの writeBatch で登録する:
 * Receipt(image_reference は null)/ ReceiptItem / 新規 FoodItem / Lot + PURCHASE(RECEIPT)/
 * receiptFoodMappings の upsert / consumptionProfiles の再計算。
 * AI の解析結果をそのまま登録する経路は無い(呼び出しは確認画面の確定ボタンのみ)。
 */
export async function confirmReceipt(
  uid: string,
  rows: readonly ReceiptRowInput[],
  purchaseDate: Date,
  existingEvents: readonly InventoryEvent[],
  existingMappings: readonly ReceiptFoodMapping[],
): Promise<void> {
  const col = (name: string) => collection(db, "users", uid, name);
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);
  // 新しい ID は doc() で採番(planReceipt は純粋関数なので ID 生成器を渡す)。
  const plan = planReceipt(
    rows,
    purchaseDate,
    now,
    () => doc(col("receipts")).id,
  );
  const purchasedTs = Timestamp.fromDate(plan.purchasedAt);
  const batch = writeBatch(db);

  batch.set(doc(col("receipts"), plan.receiptId), {
    image_reference: null,
    purchased_at: purchasedTs,
    created_at: nowTs,
  });
  for (const f of plan.newFoods) {
    batch.set(doc(col("foodItems"), f.id), {
      name: f.name,
      base_unit: f.base_unit,
      created_at: nowTs,
      updated_at: nowTs,
    });
  }
  for (const it of plan.receiptItems) {
    batch.set(doc(col("receiptItems"), it.id), {
      receipt_id: plan.receiptId,
      raw_name: it.raw_name,
      food_item_id: it.food_item_id,
      quantity: it.quantity,
      unit: it.unit,
      confirmed: it.confirmed,
    });
  }
  for (const l of plan.lots) {
    batch.set(doc(col("inventoryLots"), l.id), {
      food_item_id: l.food_item_id,
      purchased_at: purchasedTs,
      created_at: nowTs,
      updated_at: nowTs,
    });
  }
  const created: InventoryEvent[] = [];
  for (const e of plan.events) {
    const ref = doc(col("inventoryEvents"));
    batch.set(ref, {
      inventory_lot_id: e.lot_id,
      food_item_id: e.food_item_id,
      event_type: "PURCHASE",
      quantity_delta: e.quantity_delta,
      source_type: "RECEIPT",
      source_id: plan.receiptId,
      occurred_at: purchasedTs,
      created_at: nowTs,
    });
    created.push({
      id: ref.id,
      inventory_lot_id: e.lot_id,
      food_item_id: e.food_item_id,
      event_type: "PURCHASE",
      quantity_delta: e.quantity_delta,
      source_type: "RECEIPT",
      source_id: plan.receiptId,
      occurred_at: plan.purchasedAt,
      created_at: now,
    });
  }
  const existingByRaw = new Map(existingMappings.map((m) => [m.id, m]));
  for (const m of plan.mappings) {
    batch.set(doc(col("receiptFoodMappings"), m.docId), {
      raw_name: m.raw_name,
      food_item_id: m.food_item_id,
      created_at: existingByRaw.has(m.docId)
        ? Timestamp.fromDate(existingByRaw.get(m.docId)!.created_at)
        : nowTs,
      updated_at: nowTs,
    });
  }
  for (const foodId of plan.affectedFoodIds) {
    const p = computeConsumptionProfile(
      [
        ...existingEvents.filter((e) => e.food_item_id === foodId),
        ...created.filter((e) => e.food_item_id === foodId),
      ],
      now,
    );
    batch.set(doc(col("consumptionProfiles"), foodId), {
      consumption_rate: p.consumption_rate,
      observation_count: p.observation_count,
      confidence_score: p.confidence_score,
      calculated_at: nowTs,
    });
  }

  await commitBatch(batch);
}
