import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import { useInventory } from "../contexts/useInventory";
import { useFoodViews } from "../hooks/useFoodViews";
import { formatQty } from "../lib/format";

type Sort = "stock" | "name";

export default function FoodList() {
  const { loading, error } = useInventory();
  const views = useFoodViews();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("stock");

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
      </div>

      {error && <p role="alert">データを読み込めませんでした。</p>}
      {loading && <p role="status">読み込み中...</p>}
      {!loading && !error && views.length === 0 && (
        <p className="empty-state">
          食材がまだありません。「食材を登録」から追加してください。
        </p>
      )}
      {!loading && views.length > 0 && visible.length === 0 && (
        <p className="empty-state">該当する食材がありません。</p>
      )}

      <ul className="list">
        {visible.map((v) => (
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
                  推定精度: {v.confidence}(履歴 {v.profile.observation_count}
                  件)
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
