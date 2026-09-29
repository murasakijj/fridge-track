import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import FoodGate from "../components/FoodGate";
import QuantityField from "../components/QuantityField";
import { useInventory } from "../contexts/useInventory";
import {
  formatQty,
  parseDateInput,
  parseQtyInput,
  toDateInputValue,
} from "../lib/format";
import { addStock } from "../lib/inventoryWrites";
import type { FoodView } from "../lib/foodView";

function Form({ view }: { view: FoodView }) {
  const { uid, lots, events } = useInventory();
  const navigate = useNavigate();
  const { food } = view;
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = parseQtyInput(qty);
  const d = parseDateInput(date);
  const valid = q !== null && q > 0 && d !== null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addStock({ uid, lots, events }, food, q, d);
      navigate(`/foods/${food.id}`, { replace: true });
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="form">
      <p className="muted">
        現在の記録上の在庫: {formatQty(view.total, food.base_unit)}
      </p>
      <QuantityField
        label="追加する数量"
        unit={food.base_unit}
        value={qty}
        onChange={setQty}
        autoFocus
      />
      <div className="field">
        <label htmlFor="purchase-date">購入日</label>
        <input
          id="purchase-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <p className="hint">新しいロットとして追加されます。</p>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!valid || saving}
        >
          追加する
        </button>
        <Link to={`/foods/${food.id}`} className="btn">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

export default function StockAdd() {
  return (
    <FoodGate title={(v) => `${v.food.name}: 在庫追加`}>
      {(view) => <Form view={view} />}
    </FoodGate>
  );
}
