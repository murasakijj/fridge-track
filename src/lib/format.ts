import type { EventType } from "../../shared/types.js";

export function formatQty(n: number, unit: string): string {
  return `${n}${unit}`;
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

/** <input type="date"> 用 (ローカル日付 YYYY-MM-DD)。 */
export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD をローカル日付として解釈。不正なら null。 */
export function parseDateInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  PURCHASE: "購入",
  CONSUME: "消費",
  DISCARD: "廃棄",
  ADJUST: "補正",
};

export const SOURCE_TYPE_LABEL = {
  MANUAL: "手動",
  RECIPE: "レシピ",
  RECEIPT: "レシート",
  SYSTEM: "システム",
} as const;

/** 符号付き表示 (+100 / -20)。 */
export function formatDelta(n: number, unit: string): string {
  return `${n > 0 ? "+" : ""}${n}${unit}`;
}

/** 数量入力の文字列を数値に。空・不正は null。 */
export function parseQtyInput(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
