const STORAGE_KEY = "fridge-track:show-zero-stock";

/** 保存値を復元する。"1" のときだけ表示(既定は非表示)。 */
export function parseShowZero(raw: string | null): boolean {
  return raw === "1";
}

export function serializeShowZero(show: boolean): string {
  return show ? "1" : "0";
}

/** localStorage が使えなくても(例外でも)既定=非表示で動く。 */
export function loadShowZero(): boolean {
  try {
    return parseShowZero(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function saveShowZero(show: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeShowZero(show));
  } catch {
    // 保存できなくても切替自体は動く
  }
}
