import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import FoodGate from "../components/FoodGate";
import EventList from "../components/EventList";
import type { EventType } from "../../shared/types.js";
import { EVENT_TYPES } from "../../shared/types.js";
import { EVENT_TYPE_LABEL, formatDate, formatQty } from "../lib/format";
import type { FoodView } from "../lib/foodView";

function Detail({ view }: { view: FoodView }) {
  const { food, total, lots, events, profile, confidence, estimate } = view;
  const [filter, setFilter] = useState<EventType | "ALL">("ALL");
  const unit = food.base_unit;

  const activeLots = lots.filter((l) => l.balance > 0);
  const usedLots = lots.filter((l) => !(l.balance > 0));
  const shown = useMemo(
    () =>
      events
        .filter((e) => filter === "ALL" || e.event_type === filter)
        .sort(
          (a, b) =>
            b.occurred_at.getTime() - a.occurred_at.getTime() ||
            b.created_at.getTime() - a.created_at.getTime(),
        ),
    [events, filter],
  );

  return (
    <>
      <section className="card summary">
        <div className="summary-total">
          <span className="muted">記録上の在庫</span>
          <span className="summary-qty">{formatQty(total, unit)}</span>
        </div>
        <p>
          <span className={`badge badge-${estimate.state}`}>
            {estimate.label}
          </span>
          <span className="muted"> (推定)</span>
        </p>
        <dl className="stats">
          <div>
            <dt>推定消費速度</dt>
            <dd>
              {profile.consumption_rate > 0
                ? `約${Math.round(profile.consumption_rate * 100) / 100}${unit} / 日`
                : "未算出"}
            </dd>
          </div>
          <div>
            <dt>推定精度</dt>
            <dd>{confidence}</dd>
          </div>
          <div>
            <dt>履歴(消費・補正)</dt>
            <dd>{profile.observation_count}件</dd>
          </div>
        </dl>
      </section>

      <div className="action-grid">
        <Link to={`/foods/${food.id}/add`} className="btn btn-primary">
          在庫追加
        </Link>
        <Link to={`/foods/${food.id}/consume`} className="btn">
          消費
        </Link>
        <Link to={`/foods/${food.id}/adjust`} className="btn">
          補正
        </Link>
        <Link to={`/foods/${food.id}/discard`} className="btn">
          廃棄
        </Link>
      </div>

      <section>
        <h2>ロット</h2>
        {activeLots.length === 0 && (
          <p className="empty-state">残量のあるロットはありません。</p>
        )}
        <ul className="list">
          {activeLots.map((l) => (
            <li key={l.lot.id} className="card lot-row">
              <span>購入日 {formatDate(l.lot.purchased_at)}</span>
              <strong>{formatQty(l.balance, unit)}</strong>
            </li>
          ))}
        </ul>
        {usedLots.length > 0 && (
          <details className="used-lots">
            <summary>使い切ったロット({usedLots.length})</summary>
            <ul className="list">
              {usedLots.map((l) => (
                <li key={l.lot.id} className="card lot-row muted">
                  <span>購入日 {formatDate(l.lot.purchased_at)}</span>
                  <span>{formatQty(l.balance, unit)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <h2>履歴</h2>
        <div className="chips" role="group" aria-label="種別で絞り込み">
          <button
            type="button"
            className={`chip${filter === "ALL" ? " chip-active" : ""}`}
            aria-pressed={filter === "ALL"}
            onClick={() => setFilter("ALL")}
          >
            すべて
          </button>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip${filter === t ? " chip-active" : ""}`}
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
            >
              {EVENT_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="empty-state">履歴がありません。</p>
        ) : (
          <EventList events={shown} unitOf={() => unit} />
        )}
      </section>
    </>
  );
}

export default function FoodDetail() {
  return (
    <FoodGate title={(v) => v.food.name}>
      {(view) => <Detail view={view} />}
    </FoodGate>
  );
}
