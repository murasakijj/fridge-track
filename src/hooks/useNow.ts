import { useEffect, useState } from "react";

/** 現在時刻。1 分ごとに更新する(推定状態の再評価用)。 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
