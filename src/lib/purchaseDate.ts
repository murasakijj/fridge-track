/** 購入日(日付)から purchased_at を決める。今日なら現在時刻、過去日は正午。 */
export function purchasedAtFor(date: Date, now: Date): Date {
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return now;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/** 購入日が今日(ローカル)より後なら true。 */
export function isFuturePurchaseDate(date: Date, now: Date): boolean {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return day.getTime() > today.getTime();
}
