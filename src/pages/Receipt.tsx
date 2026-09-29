import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import InventoryError from "../components/InventoryError";
import { useInventory } from "../contexts/useInventory";
import {
  parseReceiptImage,
  receiptErrorMessage,
  resizeImage,
} from "../lib/receiptClient";
import { confirmReceipt } from "../lib/receiptWrites";
import type { ReceiptRowInput } from "../lib/receiptPlan";
import {
  buildReviewRows,
  initialQuantity,
  type ReviewRow,
} from "../../shared/receipt.js";
import { BASE_UNIT_OPTIONS } from "../../shared/units.js";
import { parseDateInput, parseQtyInput, toDateInputValue } from "../lib/format";
import { isFuturePurchaseDate } from "../lib/purchaseDate";

type Stage = "select" | "parsing" | "review" | "saving";

const NEW_FOOD = "__new__";
const MAX_FOODS_SENT = 500;

/** 画面上の 1 行(共有の ReviewRow + 新規食材の入力)。 */
interface Row extends ReviewRow {
  new_name: string;
  new_unit: string;
}

const SAVE_ERRORS: Record<string, string> = {
  future_date: "購入日に未来の日付は指定できません。",
  row_incomplete: "食材と数量が未入力の行があります。",
  nothing_to_register: "登録する行がありません。",
  too_many_rows: "明細が多すぎます。行を除外して分けて登録してください。",
};

export default function Receipt() {
  const {
    uid,
    foods,
    events,
    mappings,
    loading,
    error: loadError,
  } = useInventory();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("select");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const sortedFoods = useMemo(
    () => [...foods].sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [foods],
  );
  const today = toDateInputValue(new Date());

  const baseUnitOf = (r: Row): string | undefined =>
    r.food_item_id === NEW_FOOD
      ? r.new_unit
      : foodMap.get(r.food_item_id)?.base_unit;

  const onFile = async (file: File | undefined) => {
    if (!file || loading || loadError) return;
    setError(null);
    setStage("parsing");
    try {
      const image = await resizeImage(file);
      // サーバーの上限(500 件)を超えないよう、名前順の先頭 500 件だけ送る。
      const result = await parseReceiptImage(
        image,
        sortedFoods
          .slice(0, MAX_FOODS_SENT)
          .map((f) => ({ id: f.id, name: f.name, base_unit: f.base_unit })),
      );
      const built = buildReviewRows(result.items, foods, mappings);
      setRows(
        built.map((r) => ({
          ...r,
          new_name: r.raw_name,
          new_unit: BASE_UNIT_OPTIONS[0],
        })),
      );
      if (result.purchased_at) {
        const d = parseDateInput(result.purchased_at);
        if (d && !isFuturePurchaseDate(d, new Date())) {
          setDate(result.purchased_at);
        }
      }
      setStage("review");
    } catch (err) {
      setError(receiptErrorMessage(err));
      setStage("select");
    }
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // 食材(または新規の単位)が変わったら、数量を触っていない限り AI の値を換算し直す。
        if (
          ("food_item_id" in patch || "new_unit" in patch) &&
          !next.quantity_touched
        ) {
          next.quantity = initialQuantity(
            next.ai_quantity,
            next.ai_unit,
            baseUnitOf(next),
          );
        }
        return next;
      }),
    );

  const included = rows.filter((r) => r.included);
  const rowComplete = (r: Row) => {
    const q = parseQtyInput(r.quantity);
    if (q === null || !(q > 0)) return false;
    if (r.food_item_id === NEW_FOOD) return r.new_name.trim().length > 0;
    return r.food_item_id !== "";
  };
  const purchaseDate = parseDateInput(date);
  const canConfirm =
    !loading &&
    !loadError &&
    included.length > 0 &&
    included.every(rowComplete) &&
    purchaseDate !== null &&
    !isFuturePurchaseDate(purchaseDate, new Date());

  const onConfirm = async () => {
    if (!canConfirm || !purchaseDate || stage === "saving") return;
    setStage("saving");
    setError(null);
    const inputs: ReceiptRowInput[] = rows.map((r) => {
      const isNew = r.food_item_id === NEW_FOOD;
      return {
        rawName: r.raw_name,
        foodItemId: isNew || r.food_item_id === "" ? null : r.food_item_id,
        newFood: isNew
          ? { name: r.new_name.trim(), base_unit: r.new_unit }
          : null,
        quantity: parseQtyInput(r.quantity),
        unit: baseUnitOf(r) ?? r.ai_unit,
        aiQuantity: r.ai_quantity,
        aiUnit: r.ai_unit,
        included: r.included,
      };
    });
    try {
      await confirmReceipt(uid, inputs, purchaseDate, events, mappings);
      navigate("/", { replace: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(
        SAVE_ERRORS[code] ?? "登録に失敗しました。もう一度お試しください。",
      );
      setStage("review");
    }
  };

  return (
    <AppShell title="レシート読み込み">
      {(stage === "select" || stage === "parsing") && (
        <section className="form">
          <p className="muted">
            レシートを撮影または選択すると、購入した食材の候補を読み取ります。
            確認・修正してから登録するまで、在庫は変わりません。
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            hidden
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={stage === "parsing" || loading || loadError}
              onClick={() => cameraRef.current?.click()}
            >
              撮影する
            </button>
            <button
              type="button"
              className="btn"
              disabled={stage === "parsing" || loading || loadError}
              onClick={() => fileRef.current?.click()}
            >
              画像を選ぶ
            </button>
          </div>
          {loadError && <InventoryError />}
          {loading && !loadError && <p role="status">読み込み中...</p>}
          {stage === "parsing" && (
            <p role="status">
              レシートを読み取っています(数十秒かかることがあります)...
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      )}

      {(stage === "review" || stage === "saving") && (
        <section className="form">
          <div className="field">
            <label htmlFor="receipt-date">購入日</label>
            <input
              id="receipt-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {rows.length === 0 && (
            <p className="warning" role="status">
              食材が見つかりませんでした。撮り直してください。
            </p>
          )}

          <ul className="list">
            {rows.map((r) => {
              const unit = baseUnitOf(r);
              const q = parseQtyInput(r.quantity);
              return (
                <li
                  key={r.key}
                  className={`card receipt-row${r.included ? "" : " receipt-row-off"}`}
                >
                  <label className="radio-row">
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={(e) =>
                        update(r.key, { included: e.target.checked })
                      }
                    />
                    <strong>{r.raw_name}</strong>
                  </label>
                  {r.included && (
                    <>
                      <div className="field">
                        <label htmlFor={`food-${r.key}`}>食材</label>
                        <select
                          id={`food-${r.key}`}
                          value={r.food_item_id}
                          onChange={(e) =>
                            update(r.key, { food_item_id: e.target.value })
                          }
                        >
                          <option value="">選択してください</option>
                          {sortedFoods.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}({f.base_unit})
                            </option>
                          ))}
                          <option value={NEW_FOOD}>
                            + 新しい食材として登録
                          </option>
                        </select>
                      </div>
                      {r.food_item_id === NEW_FOOD && (
                        <div className="field">
                          <label htmlFor={`newname-${r.key}`}>
                            新しい食材名
                          </label>
                          <input
                            id={`newname-${r.key}`}
                            value={r.new_name}
                            maxLength={100}
                            onChange={(e) =>
                              update(r.key, { new_name: e.target.value })
                            }
                          />
                          <label htmlFor={`newunit-${r.key}`}>管理単位</label>
                          <select
                            id={`newunit-${r.key}`}
                            value={r.new_unit}
                            onChange={(e) =>
                              update(r.key, { new_unit: e.target.value })
                            }
                          >
                            {BASE_UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="field">
                        <label htmlFor={`qty-${r.key}`}>
                          数量{unit ? `(${unit})` : ""}
                        </label>
                        <div className="qty-row">
                          <input
                            id={`qty-${r.key}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={r.quantity}
                            onChange={(e) =>
                              update(r.key, {
                                quantity: e.target.value,
                                quantity_touched: true,
                              })
                            }
                          />
                          <span className="qty-unit">{unit ?? ""}</span>
                        </div>
                        <p className="hint">
                          読み取り: {r.ai_quantity}
                          {r.ai_unit}
                          {r.quantity === "" && unit
                            ? "(この単位からは換算できません。数量を入力してください)"
                            : ""}
                        </p>
                        {r.quantity !== "" && (q === null || q <= 0) && (
                          <p className="warning" role="alert">
                            数量は 0 より大きい数を入力してください。
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canConfirm || stage === "saving"}
              onClick={() => void onConfirm()}
            >
              {included.length}件を登録する
            </button>
            <button
              type="button"
              className="btn"
              disabled={stage === "saving"}
              onClick={() => {
                setRows([]);
                setStage("select");
              }}
            >
              やり直す
            </button>
            <Link to="/" className="btn">
              キャンセル
            </Link>
          </div>
        </section>
      )}
    </AppShell>
  );
}
