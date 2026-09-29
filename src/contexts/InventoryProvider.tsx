import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  convertDocs,
  eventFromDoc,
  foodFromDoc,
  lotFromDoc,
  mappingFromDoc,
} from "../lib/inventoryData";
import type {
  FoodItem,
  InventoryEvent,
  InventoryLot,
  ReceiptFoodMapping,
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
  const [mappings, setMappings] = useState<ReceiptFoodMapping[]>([]);
  const [ready, setReady] = useState({
    foods: false,
    lots: false,
    events: false,
  });
  const [error, setError] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!uid) return;
    const base = ["users", uid] as const;
    const onError = () => setError(true);
    const unsubs = [
      onSnapshot(
        collection(db, ...base, "foodItems"),
        (snap) => {
          setFoods(convertDocs(snap.docs, foodFromDoc));
          setReady((r) => ({ ...r, foods: true }));
        },
        onError,
      ),
      onSnapshot(
        collection(db, ...base, "inventoryLots"),
        (snap) => {
          setLots(convertDocs(snap.docs, lotFromDoc));
          setReady((r) => ({ ...r, lots: true }));
        },
        onError,
      ),
      onSnapshot(
        collection(db, ...base, "inventoryEvents"),
        { includeMetadataChanges: true },
        (snap) => {
          setEvents(convertDocs(snap.docs, eventFromDoc));
          setPendingWrites(snap.metadata.hasPendingWrites);
          setReady((r) => ({ ...r, events: true }));
        },
        onError,
      ),
      // マッピングは補助情報なので、読み込み完了を待たない(失敗しても他画面は使える)。
      onSnapshot(
        collection(db, ...base, "receiptFoodMappings"),
        (snap) => setMappings(convertDocs(snap.docs, mappingFromDoc)),
        (err) => console.warn("[inventory] mappings unavailable", err.code),
      ),
    ];
    return () => {
      unsubs.forEach((u) => u());
      // uid 変更・再試行のたびに状態を初期化し、エラーを引きずらない。
      setReady({ foods: false, lots: false, events: false });
      setError(false);
      setPendingWrites(false);
    };
  }, [uid, attempt]);

  const value = useMemo(
    () => ({
      foods,
      lots,
      events,
      mappings,
      uid,
      loading: !(ready.foods && ready.lots && ready.events) && !error,
      error,
      retry,
      pendingWrites,
    }),
    [foods, lots, events, mappings, uid, ready, error, retry, pendingWrites],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}
