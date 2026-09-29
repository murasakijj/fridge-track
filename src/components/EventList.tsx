import { Link } from "react-router-dom";
import type { InventoryEvent } from "../../shared/types.js";
import {
  EVENT_TYPE_LABEL,
  SOURCE_TYPE_LABEL,
  formatDateTime,
  formatDelta,
} from "../lib/format";

export default function EventList({
  events,
  unitOf,
  nameOf,
}: {
  events: readonly InventoryEvent[];
  unitOf: (foodId: string) => string;
  /** 指定すると食材名(詳細へのリンク)を表示する。 */
  nameOf?: (foodId: string) => string;
}) {
  return (
    <ul className="list">
      {events.map((e) => (
        <li key={e.id} className="card event-row">
          <div className="event-row-main">
            <span className={`badge badge-ev-${e.event_type}`}>
              {EVENT_TYPE_LABEL[e.event_type]}
            </span>
            {nameOf && (
              <Link to={`/foods/${e.food_item_id}`} className="event-food">
                {nameOf(e.food_item_id)}
              </Link>
            )}
            <span className="event-delta">
              {formatDelta(e.quantity_delta, unitOf(e.food_item_id))}
            </span>
          </div>
          <div className="muted event-row-sub">
            {formatDateTime(e.occurred_at)} ・{" "}
            {SOURCE_TYPE_LABEL[e.source_type]}
            {e.note ? ` ・ ${e.note}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
