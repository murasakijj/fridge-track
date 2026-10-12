import { normalizeCategory } from "../../shared/categories.js";

/**
 * foodItems 新規ドキュメントのペイロード。category が未設定(null)のときは
 * キー自体を書かない(旧ルールのままでも未分類の登録は通る)。
 */
export function newFoodDoc<T>(
  input: {
    name: string;
    base_unit: string;
    category?: string | null;
  },
  now: T,
): {
  name: string;
  base_unit: string;
  category?: string;
  created_at: T;
  updated_at: T;
} {
  const category = normalizeCategory(input.category);
  return {
    name: input.name,
    base_unit: input.base_unit,
    ...(category ? { category } : {}),
    created_at: now,
    updated_at: now,
  };
}
