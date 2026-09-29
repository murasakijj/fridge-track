import { createContext } from "react";
import type {
  FoodItem,
  InventoryEvent,
  InventoryLot,
} from "../../shared/types.js";

export interface InventoryContextValue {
  foods: FoodItem[];
  lots: InventoryLot[];
  events: InventoryEvent[];
  /** 3 コレクションすべての最初のスナップショットが届くまで true。 */
  loading: boolean;
  error: boolean;
  /** エラー後に購読をやり直す。 */
  retry: () => void;
  /** サーバー未確認の書込みがある(オフライン等)。 */
  pendingWrites: boolean;
  uid: string;
}

export const InventoryContext = createContext<
  InventoryContextValue | undefined
>(undefined);
