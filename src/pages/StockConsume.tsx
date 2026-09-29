import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import FoodGate from "../components/FoodGate";
import QuantityField from "../components/QuantityField";
import { useInventory } from "../contexts/useInventory";
import { formatQty, parseQtyInput } from "../lib/format";
import { consumeManual } from "../lib/inventoryWrites";
import { planFifo } from "../../shared/inventory.js";
import type { FoodView } from "../lib/foodView";

function Form({ view }: { view: FoodView }) {
  const { uid, lots, events } = useInventory();
  const navigate = useNavigate();
  const { food } = view;
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = parseQtyInput(qty);
  const valid = q !== null && q > 0;
  const plan = useMemo(
    () =>
      valid
        ? planFifo(
            view.lots.map((l) => l.lot),
            view.events,
            q,
          )
        : null,
    [valid, q, view],
  );
  const canSubmit = valid && plan !== null && plan.allocations.length > 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      await consumeManual({ uid, lots, events }, food, q);
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
        label="使った数量"
        unit={food.base_unit}
        value={qty}
        onChange={setQty}
        autoFocus
      />
      <p className="hint">古いロットから順に消費します(FIFO)。</p>
      {plan && plan.shortage > 0 && (
        <p className="warning" role="alert">
          在庫が {formatQty(plan.shortage, food.base_unit)} 足りません。
          {plan.allocations.length > 0
            ? "不足分は記録されません。"
            : "記録できる在庫がありません。"}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!canSubmit || saving}
        >
          消費を記録
        </button>
        <Link to={`/foods/${food.id}`} className="btn">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

export default function StockConsume() {
  return (
    <FoodGate title={(v) => `${v.food.name}: 消費`}>
      {(view) => <Form view={view} />}
    </FoodGate>
  );
}
