import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import FoodGate from "../components/FoodGate";
import QuantityField from "../components/QuantityField";
import { useInventory } from "../contexts/useInventory";
import { formatDate, formatQty, parseQtyInput } from "../lib/format";
import { discardFifo, discardLot } from "../lib/inventoryWrites";
import { planFifo } from "../../shared/inventory.js";
import type { FoodView } from "../lib/foodView";

type Mode = "lot" | "fifo";

function Form({ view }: { view: FoodView }) {
  const { uid, lots, events } = useInventory();
  const navigate = useNavigate();
  const { food } = view;
  const activeLots = view.lots.filter((l) => l.balance > 0);
  const [mode, setMode] = useState<Mode>(
    activeLots.length > 0 ? "lot" : "fifo",
  );
  const [lotId, setLotId] = useState(activeLots[0]?.lot.id ?? "");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = parseQtyInput(qty);
  const selected = activeLots.find((l) => l.lot.id === lotId);

  const fifoPlan = useMemo(
    () =>
      mode === "fifo" && q !== null && q > 0
        ? planFifo(
            view.lots.map((l) => l.lot),
            view.events,
            q,
          )
        : null,
    [mode, q, view],
  );

  // Lot 指定: 量は空なら全量、指定するなら 0 より大きく残量以下に丸める。
  const lotValid =
    mode === "lot" &&
    !!selected &&
    (qty.trim() === "" || (q !== null && q > 0));
  const fifoValid =
    mode === "fifo" && !!fifoPlan && fifoPlan.allocations.length > 0;
  const canSubmit = lotValid || fifoValid;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const ctx = { uid, lots, events };
      if (mode === "lot") {
        await discardLot(
          ctx,
          food,
          lotId,
          qty.trim() === "" ? undefined : (q ?? undefined),
        );
      } else if (q !== null) {
        await discardFifo(ctx, food, q);
      }
      navigate(`/foods/${food.id}`, { replace: true });
    } catch {
      setError("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
    }
  };

  if (view.total <= 0 && activeLots.length === 0) {
    return <p className="empty-state">廃棄できる在庫がありません。</p>;
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="form">
      <p className="muted">
        現在の記録上の在庫: {formatQty(view.total, food.base_unit)}
      </p>

      <div className="chips" role="group" aria-label="廃棄の方法">
        <button
          type="button"
          className={`chip${mode === "lot" ? " chip-active" : ""}`}
          aria-pressed={mode === "lot"}
          onClick={() => setMode("lot")}
        >
          ロットを選ぶ
        </button>
        <button
          type="button"
          className={`chip${mode === "fifo" ? " chip-active" : ""}`}
          aria-pressed={mode === "fifo"}
          onClick={() => setMode("fifo")}
        >
          量を指定(古い順)
        </button>
      </div>

      {mode === "lot" && (
        <fieldset className="field">
          <legend>廃棄するロット</legend>
          {activeLots.map((l) => (
            <label key={l.lot.id} className="radio-row">
              <input
                type="radio"
                name="lot"
                value={l.lot.id}
                checked={lotId === l.lot.id}
                onChange={() => setLotId(l.lot.id)}
              />
              <span>
                購入日 {formatDate(l.lot.purchased_at)} ・{" "}
                {formatQty(l.balance, food.base_unit)}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <QuantityField
        label={
          mode === "lot" ? "廃棄する数量(空欄で残量すべて)" : "廃棄する数量"
        }
        unit={food.base_unit}
        value={qty}
        onChange={setQty}
      />
      {mode === "lot" && selected && q !== null && q > selected.balance && (
        <p className="hint">
          残量を超えているため {formatQty(selected.balance, food.base_unit)}{" "}
          を廃棄します。
        </p>
      )}
      {fifoPlan && fifoPlan.shortage > 0 && (
        <p className="warning" role="alert">
          在庫が {formatQty(fifoPlan.shortage, food.base_unit)} 足りません。
          不足分は記録されません。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-danger"
          disabled={!canSubmit || saving}
        >
          廃棄を記録
        </button>
        <Link to={`/foods/${food.id}`} className="btn">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

export default function StockDiscard() {
  return (
    <FoodGate title={(v) => `${v.food.name}: 廃棄`}>
      {(view) => <Form view={view} />}
    </FoodGate>
  );
}
