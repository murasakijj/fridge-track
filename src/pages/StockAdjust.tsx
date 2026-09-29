import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import FoodGate from "../components/FoodGate";
import QuantityField from "../components/QuantityField";
import { useInventory } from "../contexts/useInventory";
import { formatDelta, formatQty, parseQtyInput } from "../lib/format";
import { adjustStock } from "../lib/inventoryWrites";
import { roundQty } from "../../shared/qty.js";
import type { FoodView } from "../lib/foodView";

const QUICK = [0, 25, 50, 75, 100];

function Form({ view }: { view: FoodView }) {
  const { uid, lots, events } = useInventory();
  const navigate = useNavigate();
  const { food } = view;
  const isPercent = food.base_unit === "%";
  const [value, setValue] = useState(String(view.total));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actual = parseQtyInput(value);
  const valid = actual !== null && actual >= 0;
  const diff = valid ? roundQty(actual - view.total) : null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await adjustStock({ uid, lots, events }, food, actual);
      navigate(`/foods/${food.id}`, { replace: true });
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="form">
      <p className="muted">
        記録上の在庫: {formatQty(view.total, food.base_unit)}
      </p>

      {isPercent && (
        <div className="field">
          <label htmlFor="adjust-slider">実際の残量(スライダー)</label>
          <input
            id="adjust-slider"
            type="range"
            min={0}
            max={Math.max(100, Math.ceil(view.total / 10) * 10)}
            step={1}
            value={valid ? Math.min(actual, 1000) : 0}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="chips" role="group" aria-label="クイック設定">
            {QUICK.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${valid && actual === p ? " chip-active" : ""}`}
                onClick={() => setValue(String(p))}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      )}

      <QuantityField
        label="今、実際にある量"
        unit={food.base_unit}
        value={value}
        onChange={setValue}
      />

      {diff !== null && (
        <p className="hint">
          {diff === 0
            ? "記録上の在庫と同じです。補正は作成されません。"
            : `差分 ${formatDelta(diff, food.base_unit)} を補正として記録します。`}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!valid || diff === 0 || saving}
        >
          補正する
        </button>
        <Link to={`/foods/${food.id}`} className="btn">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

export default function StockAdjust() {
  return (
    <FoodGate title={(v) => `${v.food.name}: 在庫補正`}>
      {(view) => <Form view={view} />}
    </FoodGate>
  );
}
