import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import Layout from "./components/Layout";
import { FullPageSpinner } from "./components/ui";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Catalog from "./pages/Catalog";
import ItemDetail from "./pages/ItemDetail";
import MyLoans from "./pages/MyLoans";
import MyReservations from "./pages/MyReservations";
import Credits from "./pages/Credits";
import Cart from "./pages/Cart";
import AdminRequests from "./pages/admin/Requests";
import AdminInventory from "./pages/admin/Inventory";
import AdminReservations from "./pages/admin/Reservations";
import AdminCheckoutDesk from "./pages/admin/CheckoutDesk";
import AdminReports from "./pages/admin/Reports";
import AdminUsers from "./pages/admin/Users";

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
        <CartProvider>
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
                <Route path="my-reservations" element={<MyReservations />} />
                <Route path="cart" element={<Cart />} />
                <Route path="credits" element={<Credits />} />
                <Route element={<RequireAdmin />}>
                  <Route path="admin/requests" element={<AdminRequests />} />
                  <Route path="admin/users" element={<AdminUsers />} />
                  <Route path="admin/inventory" element={<AdminInventory />} />
                  <Route path="admin/scan" element={<AdminCheckoutDesk />} />
                  <Route path="admin/reports" element={<AdminReports />} />
                  <Route
                    path="admin/reservations"
                    element={<AdminReservations />}
                  />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
