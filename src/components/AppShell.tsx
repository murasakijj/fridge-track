import { useContext, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { InventoryContext } from "../contexts/inventory-context";

export default function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { user, signOutUser } = useAuth();
  const pending = useContext(InventoryContext)?.pendingWrites ?? false;

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-title">
          冷蔵庫在庫
        </Link>
        <div className="app-header-user">
          {user && (
            <span className="app-user-name">
              {user.displayName ?? user.email}
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => void signOutUser()}
          >
            ログアウト
          </button>
        </div>
      </header>
      <nav className="app-nav" aria-label="メイン">
        <NavLink to="/" end>
          食材
        </NavLink>
        <NavLink to="/receipt">レシート</NavLink>
        <NavLink to="/history">履歴</NavLink>
      </nav>
      {pending && (
        <p className="sync-hint" role="status">
          同期待ち(オンラインになると自動で保存されます)
        </p>
      )}
      <main className="app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
