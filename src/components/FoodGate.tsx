import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import AppShell from "./AppShell";
import InventoryError from "./InventoryError";
import { useInventory } from "../contexts/useInventory";
import { useFoodView } from "../hooks/useFoodViews";
import type { FoodView } from "../lib/foodView";

/** /foods/:id 配下の画面共通: 読み込み中 / 見つからない を処理して view を渡す。 */
export default function FoodGate({
  title,
  children,
}: {
  title: (view: FoodView) => string;
  children: (view: FoodView) => ReactNode;
}) {
  const { id } = useParams();
  const { loading, error } = useInventory();
  const view = useFoodView(id);

  if (error) {
    return (
      <AppShell>
        <InventoryError />
      </AppShell>
    );
  }
  if (loading) {
    return (
      <AppShell>
        <p role="status">読み込み中...</p>
      </AppShell>
    );
  }
  if (!view) {
    return (
      <AppShell>
        <p role="alert">食材が見つかりません。</p>
        <Link to="/">食材一覧へ</Link>
      </AppShell>
    );
  }
  return (
    <AppShell title={title(view)}>
      <p className="back-link">
        <Link to={`/foods/${view.food.id}`}>← {view.food.name}の詳細へ</Link>
      </p>
      {children(view)}
    </AppShell>
  );
}
