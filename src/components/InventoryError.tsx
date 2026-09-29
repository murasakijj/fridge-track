import { useInventory } from "../contexts/useInventory";

export default function InventoryError() {
  const { retry } = useInventory();
  return (
    <div role="alert">
      <p>データを読み込めませんでした。</p>
      <button type="button" className="btn" onClick={retry}>
        再読み込み
      </button>
    </div>
  );
}
