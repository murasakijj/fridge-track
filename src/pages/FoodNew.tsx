import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { useInventory } from "../contexts/useInventory";
import { createFoodItem } from "../lib/inventoryWrites";
import { BASE_UNIT_OPTIONS } from "../../shared/units.js";

const CUSTOM = "__custom__";

export default function FoodNew() {
  const { uid, foods } = useInventory();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [unitChoice, setUnitChoice] = useState<string>(BASE_UNIT_OPTIONS[0]);
  const [customUnit, setCustomUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unit = (unitChoice === CUSTOM ? customUnit : unitChoice).trim();
  const trimmed = name.trim();
  const duplicate = trimmed
    ? foods.find((f) => f.name.trim() === trimmed)
    : undefined;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || !unit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createFoodItem(uid, { name: trimmed, base_unit: unit });
      navigate(`/foods/${id}`, { replace: true });
    } catch {
      setError("登録に失敗しました。もう一度お試しください。");
      setSaving(false);
    }
  };

  return (
    <AppShell title="食材を登録">
      <form onSubmit={(e) => void onSubmit(e)} className="form">
        <div className="field">
          <label htmlFor="food-name">食材名</label>
          <input
            id="food-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            required
          />
          {duplicate && (
            <p className="warning" role="status">
              同じ名前の食材があります。
              <Link to={`/foods/${duplicate.id}`}>既存の食材を開く</Link>
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="food-unit">管理単位</label>
          <select
            id="food-unit"
            value={unitChoice}
            onChange={(e) => setUnitChoice(e.target.value)}
          >
            {BASE_UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={CUSTOM}>その他(自由入力)</option>
          </select>
          {unitChoice === CUSTOM && (
            <input
              aria-label="管理単位(自由入力)"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              maxLength={20}
              required
            />
          )}
          <p className="hint">管理単位は登録後に変更できません。</p>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!trimmed || !unit || saving}
          >
            登録する
          </button>
          <Link to="/" className="btn">
            キャンセル
          </Link>
        </div>
      </form>
    </AppShell>
  );
}
