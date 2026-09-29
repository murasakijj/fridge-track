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
import FoodList from "./pages/FoodList";
import FoodNew from "./pages/FoodNew";
import FoodDetail from "./pages/FoodDetail";
import StockAdd from "./pages/StockAdd";
import StockConsume from "./pages/StockConsume";
import StockAdjust from "./pages/StockAdjust";
import StockDiscard from "./pages/StockDiscard";
import History from "./pages/History";

function ProtectedLayout() {
  return (
    <RequireAuth>
      <InventoryProvider>
        <Outlet />
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
            <Route path="/history" element={<History />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
