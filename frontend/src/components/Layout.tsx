import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import type { AppNotification } from "../types";
import { formatDateTime } from "../lib/format";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "./ui";

const mainNav = [
  { to: "/dashboard", label: "Dashboard", icon: "home", end: true },
  { to: "/catalog", label: "Browse Equipment", icon: "box" },
  { to: "/my-reservations", label: "My Reservations", icon: "calendar" },
  { to: "/my-loans", label: "My Loans", icon: "clipboard" },
  { to: "/credits", label: "Borrowing Credits", icon: "chart" },
];

const adminNav = [
  { to: "/admin/requests", label: "Requests", icon: "inbox" },
  { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
  { to: "/admin/inventory", label: "Inventory", icon: "layers" },
  { to: "/admin/reports", label: "Reports", icon: "chart" },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const visibleMainNav =
    user?.role === "ADMIN"
      ? mainNav.filter((item) => item.to === "/dashboard")
      : user?.role === "FACULTY"
        ? [
            ...mainNav,
            { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
          ]
        : mainNav;
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-link${isActive ? " nav-link-active" : ""}`;
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-0 py-4">
      <div>
        <p className="sidebar-nav-label px-4 pb-2 text-[10px] font-bold uppercase tracking-widest">
          Borrowing services
        </p>
        {visibleMainNav.map((n) => (
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
      {user?.role === "ADMIN" && (
        <div>
          <p className="sidebar-nav-label px-4 pb-2 text-[10px] font-bold uppercase tracking-widest">
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
    <div className="sidebar-user-panel border-t border-white/10 p-4">
      <p className="truncate text-sm font-semibold text-white">{user.name}</p>
      <p className="truncate text-xs text-slate-400">{user.email}</p>
      <div className="sidebar-account-actions mt-3 grid grid-cols-2 gap-2">
        <Badge
          tone={user.role === "ADMIN" ? "blue" : "green"}
          className="sidebar-role-badge"
        >
          {user.role}
        </Badge>
        <button
          className="sidebar-signout"
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

/**
 * Cart shortcut with a live item count. Two instances exist (sidebar and
 * mobile header), both reading the same CartContext.
 */
function CartButton({ variant }: { variant: "sidebar" | "header" }) {
  const { count } = useCart();
  const navigate = useNavigate();
  const buttonClass =
    variant === "sidebar"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-primary-800 hover:bg-primary-100";
  return (
    <button
      className={`layout-icon-button relative rounded-full p-2 transition-colors ${buttonClass}`}
      onClick={() => navigate("/cart")}
      aria-label={
        count > 0 ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"
      }
    >
      <Icon name="cart" className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-primary-950">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

/**
 * Bell + dropdown. Two instances exist (sidebar and mobile header) but the
 * polling lives in Layout, so both render the same snapshot.
 */
function NotificationBell({
  items,
  onRefresh,
  variant,
}: {
  items: AppNotification[];
  onRefresh: () => Promise<void>;
  variant: "sidebar" | "header";
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.readAt).length;

  const buttonClass =
    variant === "sidebar"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-primary-800 hover:bg-primary-100";

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.readAt) {
      try {
        await api.patch(`/notifications/${n.id}/read`);
        await onRefresh();
      } catch {
        // Non-critical: failing to mark read must not block navigating away.
      }
    }
    if (n.link) navigate(n.link);
  }

  async function markAllRead() {
    try {
      await api.patch("/notifications/read");
      await onRefresh();
    } catch {
      // Same: the bell never breaks the page it sits on.
    }
  }

  return (
    <div className="relative">
      <button
        className={`layout-icon-button relative rounded-full p-2 transition-colors ${buttonClass}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className={`absolute z-20 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ${
              variant === "sidebar" ? "left-0" : "right-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Notifications
              </span>
              {unread > 0 && (
                <button
                  className="text-xs font-semibold text-primary-800 hover:underline"
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No notifications yet.
                </p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                      n.readAt ? "opacity-60" : ""
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary-600" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {n.title}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Single poll shared by both bell instances (sidebar + mobile header).
  // The first polling interval in this app - a bell that only refreshed on
  // page reload would be useless, and 60s keeps the load negligible.
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .get<AppNotification[]>("/notifications")
        .then((res) => {
          if (!cancelled) setNotifications(res.data);
        })
        .catch(() => {
          // The bell is non-critical: keep the last snapshot on failure.
        });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const refreshNotifications = async () => {
    try {
      const res = await api.get<AppNotification[]>("/notifications");
      setNotifications(res.data);
    } catch {
      // Leave the current snapshot in place.
    }
  };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/15 bg-primary-900/90 shadow-2xl backdrop-blur-2xl lg:flex">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-5">
          <div>
            <p className="text-lg font-bold tracking-tight text-white">
              EquipHub
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
              Campus equipment desk
            </p>
          </div>
          <div className="flex items-center gap-1">
            <CartButton variant="sidebar" />
            <NotificationBell
              items={notifications}
              onRefresh={refreshNotifications}
              variant="sidebar"
            />
            <ThemeToggle variant="sidebar" />
          </div>
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
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col rounded-none bg-primary-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-primary-800 px-4 py-4">
              <div>
                <span className="block text-lg font-bold text-white">EquipHub</span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Campus equipment desk
                </span>
              </div>
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

      <header className="sticky top-0 z-30 flex items-center justify-between rounded-none border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
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
          <CartButton variant="header" />
          <NotificationBell
            items={notifications}
            onRefresh={refreshNotifications}
            variant="header"
          />
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
