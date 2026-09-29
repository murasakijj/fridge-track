import { convertQuantity } from "./units.js";
import { roundQty } from "./qty.js";

/**
 * レシート商品名の正規化(マッピングのキー)。
 * NFKC(全角半角の統一)+ 小文字化 + 空白・記号の除去。
 */
export function normalizeRawName(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[!-/:-@[-`{-~・･、。「」『』（）【】[\]★☆※*＊]/g, "");
}

/** cyrb53 ハッシュ(同期・非暗号)。ドキュメント ID 生成用。 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** receiptFoodMappings のドキュメント ID(正規化済み raw_name から決定的に作る)。 */
export function mappingDocId(normalizedRawName: string): string {
  return `m_${cyrb53(normalizedRawName).toString(36)}${cyrb53(normalizedRawName, 1).toString(36)}`;
}

/** 画像の長辺を maxSide 以下に収める縮小後サイズ(拡大はしない)。 */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longSide = Math.max(width, height);
  if (longSide <= maxSide) return { width, height };
  const scale = maxSide / longSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface AiReceiptItem {
  raw_name: string;
  food_item_id: string | null;
  quantity: number;
  unit: string;
}

export interface ReviewRow {
  key: string;
  raw_name: string;
  /** 選択中の FoodItem id。"" は未選択。 */
  food_item_id: string;
  ai_quantity: number;
  ai_unit: string;
  /** base_unit 換算後の数量(入力欄の文字列)。換算不能なら ""。 */
  quantity: string;
  quantity_touched: boolean;
  included: boolean;
}

/** 数量欄の初期値: AI の数量・単位を food の base_unit に換算(不能なら "")。 */
export function initialQuantity(
  aiQuantity: number,
  aiUnit: string,
  baseUnit: string | undefined,
): string {
  if (!baseUnit) return "";
  const q = convertQuantity(aiQuantity, aiUnit, baseUnit);
  return q === null ? "" : String(roundQty(q));
}

/**
 * AI の明細から確認用の行を作る。食材は保存済みマッピング(正規化 raw_name)を優先し、
 * 無ければ AI の提案(存在する id のみ)、それも無ければ未選択。
 */
export function buildReviewRows(
  items: readonly AiReceiptItem[],
  foods: readonly { id: string; base_unit: string }[],
  mappings: readonly { raw_name: string; food_item_id: string }[],
): ReviewRow[] {
  const foodMap = new Map(foods.map((f) => [f.id, f]));
  const mapped = new Map(mappings.map((m) => [m.raw_name, m.food_item_id]));
  return items.map((it, i) => {
    const fromMapping = mapped.get(normalizeRawName(it.raw_name));
    const candidate =
      fromMapping && foodMap.has(fromMapping)
        ? fromMapping
        : it.food_item_id && foodMap.has(it.food_item_id)
          ? it.food_item_id
          : "";
    return {
      key: `r${i}`,
      raw_name: it.raw_name,
      food_item_id: candidate,
      ai_quantity: it.quantity,
      ai_unit: it.unit,
      quantity: initialQuantity(
        it.quantity,
        it.unit,
        candidate ? foodMap.get(candidate)?.base_unit : undefined,
      ),
      quantity_touched: false,
      included: true,
    };
  });
}
