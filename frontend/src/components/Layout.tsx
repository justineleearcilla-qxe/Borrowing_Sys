import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "./ui";

const mainNav = [
  { to: "/dashboard", label: "Dashboard", icon: "home", end: true },
  { to: "/catalog", label: "Browse Equipment", icon: "box" },
  { to: "/my-reservations", label: "My Reservations", icon: "calendar" },
  { to: "/my-loans", label: "My Loans", icon: "clipboard" },
];

// Admins and faculty share the reservation queue; everything else is admin-only.
const staffNav = [
  { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
];

const adminNav = [
  { to: "/admin/requests", label: "Requests", icon: "inbox" },
  { to: "/admin/inventory", label: "Inventory", icon: "layers" },
  { to: "/admin/scan", label: "Scan / Check-out", icon: "qr" },
  { to: "/admin/reports", label: "Reports", icon: "chart" },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " nav-link-active" : ""}`;
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-0 py-4">
      <div>
        <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Main
        </p>
        {mainNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={linkClass}
            onClick={onNavigate}
          >
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </div>
      {user && (user.role === "ADMIN" || user.role === "FACULTY") && (
        <div>
          <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Equipment Desk
          </p>
          {staffNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={linkClass}
              onClick={onNavigate}
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
      {user?.role === "ADMIN" && (
        <div>
          <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Administration
          </p>
          {adminNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={linkClass}
              onClick={onNavigate}
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  );
}

function UserPanel() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
      <p className="truncate text-xs text-slate-400">{user.email}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge tone={user.role === "ADMIN" ? "blue" : "gray"}>
          {user.role}
        </Badge>
        <button
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <Icon name="logout" className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/15 bg-primary-900/90 shadow-2xl backdrop-blur-2xl lg:flex">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-5">
          <div>
            <p className="text-lg font-bold tracking-tight text-white">
              EquipHub
            </p>
            <p className="text-[11px] uppercase tracking-widest text-slate-400">
              Campus equipment, simplified
            </p>
          </div>
          <ThemeToggle variant="sidebar" />
        </div>
        <NavItems />
        <UserPanel />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-primary-900/95 shadow-xl backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-lg font-bold text-white">EquipHub</span>
              <div className="flex items-center gap-2">
                <ThemeToggle variant="sidebar" />
                <button
                  className="text-slate-300 hover:text-white"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <UserPanel />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/70 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-xl lg:hidden">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Icon name="menu" className="h-4 w-4" />
          Menu
        </button>
        <div className="flex items-center gap-3">
          <span className="font-bold text-primary-800">EquipHub</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
