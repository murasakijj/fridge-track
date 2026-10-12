import { GROUP_KEYS, type GroupKey } from "../../shared/categories.js";

const STORAGE_KEY = "fridge-track:collapsed-groups";

/** 保存値を検証して復元する。壊れた値・未知のキーは無視する。 */
export function parseCollapsed(raw: string | null): Set<GroupKey> {
  if (!raw) return new Set();
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return new Set();
    return new Set(
      v.filter((k): k is GroupKey => GROUP_KEYS.includes(k as GroupKey)),
    );
  } catch {
    return new Set();
  }
}

export function serializeCollapsed(keys: ReadonlySet<GroupKey>): string {
  return JSON.stringify(GROUP_KEYS.filter((k) => keys.has(k)));
}

/** localStorage が使えなくても(例外でも)動く。 */
export function loadCollapsed(): Set<GroupKey> {
  try {
    return parseCollapsed(localStorage.getItem(STORAGE_KEY));
  } catch {
    return new Set();
  }
}

export function saveCollapsed(keys: ReadonlySet<GroupKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeCollapsed(keys));
  } catch {
    // 保存できなくても折りたたみ自体は動く
  }
}
