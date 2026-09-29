import { Suspense, lazy } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { InventoryProvider } from "./contexts/InventoryProvider";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
const FoodList = lazy(() => import("./pages/FoodList"));
const FoodNew = lazy(() => import("./pages/FoodNew"));
const FoodDetail = lazy(() => import("./pages/FoodDetail"));
const StockAdd = lazy(() => import("./pages/StockAdd"));
const StockConsume = lazy(() => import("./pages/StockConsume"));
const StockAdjust = lazy(() => import("./pages/StockAdjust"));
const StockDiscard = lazy(() => import("./pages/StockDiscard"));
const History = lazy(() => import("./pages/History"));
const Receipt = lazy(() => import("./pages/Receipt"));

function ProtectedLayout() {
  return (
    <RequireAuth>
      <InventoryProvider>
        <Suspense fallback={<p role="status">読み込み中...</p>}>
          <Outlet />
        </Suspense>
      </InventoryProvider>
    </RequireAuth>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<FoodList />} />
            <Route path="/foods/new" element={<FoodNew />} />
            <Route path="/foods/:id" element={<FoodDetail />} />
            <Route path="/foods/:id/add" element={<StockAdd />} />
            <Route path="/foods/:id/consume" element={<StockConsume />} />
            <Route path="/foods/:id/adjust" element={<StockAdjust />} />
            <Route path="/foods/:id/discard" element={<StockDiscard />} />
            <Route path="/receipt" element={<Receipt />} />
            <Route path="/history" element={<History />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
