import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import InventoryError from "../components/InventoryError";
import { useInventory } from "../contexts/useInventory";
import { useFoodViews } from "../hooks/useFoodViews";
import { formatQty } from "../lib/format";
import { needsAttention, type FoodView } from "../lib/foodView";
import { loadCollapsed, saveCollapsed } from "../lib/collapsedGroups";
import {
  groupFoodsByCategory,
  type GroupKey,
} from "../../shared/categories.js";

type Sort = "stock" | "name";

export default function FoodList() {
  const { loading, error } = useInventory();
  const views = useFoodViews();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("stock");
  const [categoryFilter, setCategoryFilter] = useState<GroupKey | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(loadCollapsed);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? views.filter((v) => v.food.name.toLowerCase().includes(q))
      : views;
    return [...filtered].sort((a, b) => {
      if (sort === "stock") {
        const ha = a.total > 0 ? 0 : 1;
        const hb = b.total > 0 ? 0 : 1;
        if (ha !== hb) return ha - hb;
      }
      return a.food.name.localeCompare(b.food.name, "ja");
    });
  }, [views, query, sort]);

  // 検索結果(全カテゴリ横断)をカテゴリ順にグルーピング。チップの件数もこれに基づく。
  const allGroups = useMemo(
    () =>
      groupFoodsByCategory(
        visible,
        (v: FoodView) => v.food.category,
        needsAttention,
      ),
    [visible],
  );
  // 選んだカテゴリが(検索などで)0 件になったら「すべて」に戻して表示する。
  const activeFilter =
    categoryFilter !== "all" && allGroups.some((g) => g.key === categoryFilter)
      ? categoryFilter
      : "all";
  const groups =
    activeFilter === "all"
      ? allGroups
      : allGroups.filter((g) => g.key === activeFilter);
  const searching = query.trim() !== "";

  const toggleGroup = (key: GroupKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
      return next;
    });

  return (
    <AppShell>
      <div className="page-header">
        <h1 className="page-title">食材一覧</h1>
        <div className="page-header-actions">
          <Link to="/foods/new" className="btn btn-primary">
            食材を登録
          </Link>
        </div>
      </div>

      <div className="filters">
        <input
          type="search"
          placeholder="食材名で検索"
          aria-label="食材名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label="並び順">
          <button
            type="button"
            className={`chip${sort === "stock" ? " chip-active" : ""}`}
            aria-pressed={sort === "stock"}
            onClick={() => setSort("stock")}
          >
            在庫あり優先
          </button>
          <button
            type="button"
            className={`chip${sort === "name" ? " chip-active" : ""}`}
            aria-pressed={sort === "name"}
            onClick={() => setSort("name")}
          >
            名前順
          </button>
        </div>
        {allGroups.length > 0 && (
          <div className="chips" role="group" aria-label="カテゴリで絞り込み">
            <button
              type="button"
              className={`chip${activeFilter === "all" ? " chip-active" : ""}`}
              aria-pressed={activeFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            >
              すべて({visible.length})
            </button>
            {allGroups.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`chip${activeFilter === g.key ? " chip-active" : ""}`}
                aria-pressed={activeFilter === g.key}
                onClick={() => setCategoryFilter(g.key)}
              >
                {g.label}({g.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <InventoryError />}
      {loading && <p role="status">読み込み中...</p>}
      {!loading && !error && views.length === 0 && (
        <p className="empty-state">
          食材がまだありません。「食材を登録」から追加してください。
        </p>
      )}
      {!loading && views.length > 0 && visible.length === 0 && (
        <p className="empty-state">該当する食材がありません。</p>
      )}

      {groups.map((g) => {
        // 検索中は該当食材が隠れないよう、折りたたみを一時的に無視する。
        const open = searching || !collapsed.has(g.key);
        const listId = `group-${g.key}`;
        return (
          <section key={g.key} className="food-group">
            <h2 className="food-group-title">
              <button
                type="button"
                className="food-group-toggle"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => toggleGroup(g.key)}
              >
                <span className="food-group-caret" aria-hidden="true">
                  {open ? "▼" : "▶"}
                </span>
                <span className="food-group-label">{g.label}</span>
                <span className="food-group-count">{g.count}件</span>
                {g.attentionCount > 0 && (
                  <span className="badge badge-low">
                    要注意 {g.attentionCount}
                  </span>
                )}
              </button>
            </h2>
            <ul className="list" id={listId} hidden={!open}>
              {g.items.map((v) => (
                <li key={v.food.id}>
                  <Link to={`/foods/${v.food.id}`} className="card food-card">
                    <div className="food-card-main">
                      <span className="food-name">{v.food.name}</span>
                      <span className="food-qty">
                        {formatQty(v.total, v.food.base_unit)}
                      </span>
                    </div>
                    <div className="food-card-sub">
                      <span className={`badge badge-${v.estimate.state}`}>
                        {v.estimate.label}
                      </span>
                      <span className="muted">
                        推定精度: {v.confidence}(履歴{" "}
                        {v.profile.observation_count}件)
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </AppShell>
  );
}
