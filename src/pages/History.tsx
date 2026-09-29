import { useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import InventoryError from "../components/InventoryError";
import EventList from "../components/EventList";
import { useInventory } from "../contexts/useInventory";
import { EVENT_TYPES, type EventType } from "../../shared/types.js";
import { EVENT_TYPE_LABEL } from "../lib/format";

export default function History() {
  const { events, foods, loading, error } = useInventory();
  const [selected, setSelected] = useState<ReadonlySet<EventType>>(new Set());

  const foodMap = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const shown = useMemo(
    () =>
      events
        .filter((e) => selected.size === 0 || selected.has(e.event_type))
        .sort(
          (a, b) =>
            b.occurred_at.getTime() - a.occurred_at.getTime() ||
            b.created_at.getTime() - a.created_at.getTime(),
        ),
    [events, selected],
  );

  const toggle = (t: EventType) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <AppShell title="履歴">
      <div className="chips" role="group" aria-label="種別で絞り込み">
        <button
          type="button"
          className={`chip${selected.size === 0 ? " chip-active" : ""}`}
          aria-pressed={selected.size === 0}
          onClick={() => setSelected(new Set())}
        >
          すべて
        </button>
        {EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip${selected.has(t) ? " chip-active" : ""}`}
            aria-pressed={selected.has(t)}
            onClick={() => toggle(t)}
          >
            {EVENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {error && <InventoryError />}
      {loading && <p role="status">読み込み中...</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="empty-state">履歴がありません。</p>
      )}
      <EventList
        events={shown}
        unitOf={(id) => foodMap.get(id)?.base_unit ?? ""}
        nameOf={(id) => foodMap.get(id)?.name ?? "(削除された食材)"}
      />
    </AppShell>
  );
}
