import { useEffect, useMemo, useState, type ReactNode } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { eventFromDoc, foodFromDoc, lotFromDoc } from "../lib/inventoryData";
import type {
  FoodItem,
  InventoryEvent,
  InventoryLot,
} from "../../shared/types.js";
import { InventoryContext } from "./inventory-context";
import { useAuth } from "./useAuth";

/**
 * users/{uid} 配下の foodItems / inventoryLots / inventoryEvents を全件購読する
 * (個人利用規模なので全件でよい)。現在在庫はここで持たず、イベントから算出する。
 */
export function InventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [events, setEvents] = useState<InventoryEvent[]>([]);
  const [ready, setReady] = useState({
    foods: false,
    lots: false,
    events: false,
  });
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const base = ["users", uid] as const;
    const onError = () => setError(true);
    const unsubs = [
      onSnapshot(
        collection(db, ...base, "foodItems"),
        (snap) => {
          setFoods(snap.docs.map(foodFromDoc));
          setReady((r) => ({ ...r, foods: true }));
        },
        onError,
      ),
      onSnapshot(
        collection(db, ...base, "inventoryLots"),
        (snap) => {
          setLots(snap.docs.map(lotFromDoc));
          setReady((r) => ({ ...r, lots: true }));
        },
        onError,
      ),
      onSnapshot(
        collection(db, ...base, "inventoryEvents"),
        (snap) => {
          setEvents(snap.docs.map(eventFromDoc));
          setReady((r) => ({ ...r, events: true }));
        },
        onError,
      ),
    ];
    return () => {
      unsubs.forEach((u) => u());
      setReady({ foods: false, lots: false, events: false });
    };
  }, [uid]);

  const value = useMemo(
    () => ({
      foods,
      lots,
      events,
      uid,
      loading: !(ready.foods && ready.lots && ready.events) && !error,
      error,
    }),
    [foods, lots, events, uid, ready, error],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}
