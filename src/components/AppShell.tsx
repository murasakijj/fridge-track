import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const { user, signOutUser } = useAuth();

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
        <NavLink to="/history">履歴</NavLink>
      </nav>
      <main className="app-main">
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
