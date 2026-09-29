import { useMemo } from "react";
import { useInventory } from "../contexts/useInventory";
import { buildFoodView, type FoodView } from "../lib/foodView";
import { useNow } from "./useNow";

export function useFoodViews(): FoodView[] {
  const { foods, lots, events } = useInventory();
  const now = useNow();
  return useMemo(
    () => foods.map((f) => buildFoodView(f, lots, events, now)),
    [foods, lots, events, now],
  );
}

export function useFoodView(id: string | undefined): FoodView | undefined {
  const views = useFoodViews();
  return useMemo(() => views.find((v) => v.food.id === id), [views, id]);
}
