import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import { FullPageSpinner } from "./components/ui";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Catalog from "./pages/Catalog";
import ItemDetail from "./pages/ItemDetail";
import MyLoans from "./pages/MyLoans";
import AdminRequests from "./pages/admin/Requests";
import AdminInventory from "./pages/admin/Inventory";
import AdminScan from "./pages/admin/Scan";
import AdminReports from "./pages/admin/Reports";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<Layout />}>
            <Route index element={<Catalog />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="items/:id" element={<ItemDetail />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="my-loans" element={<MyLoans />} />
              <Route element={<RequireAdmin />}>
                <Route path="admin/requests" element={<AdminRequests />} />
                <Route path="admin/inventory" element={<AdminInventory />} />
                <Route path="admin/scan" element={<AdminScan />} />
                <Route path="admin/reports" element={<AdminReports />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
