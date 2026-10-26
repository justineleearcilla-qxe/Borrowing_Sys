import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { AdminDashboard, Loan, Reservation, StudentDashboard } from "../types";
import { formatDate } from "../lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";
import { loanStatusTone } from "../lib/format";
import { Icon } from "../components/Icon";

/** Remembers a dismissed penalty alert until the penalty count changes. */
const PENALTY_ALERT_KEY = "equiphub.dismissedPenaltyAlert";

function LoanRows({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) return <EmptyState title="Nothing here yet" />;
  return (
    <div className="divide-y divide-slate-200">
      {loans.map((l) => (
        <div
          key={l.id}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {l.item.name}
            </p>
            <p className="text-xs text-slate-500">
              Qty {l.quantity} - Needed {formatDate(l.dateNeeded)} - Return{" "}
              {formatDate(l.returnDate)}
            </p>
          </div>
          <Badge tone={loanStatusTone[l.status] as never}>{l.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function ReservationRows({ reservations }: { reservations: Reservation[] }) {
  if (reservations.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title="No pending reservations" />
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-200">
      {reservations.map((reservation) => (
        <div
          key={reservation.id}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {reservation.item.name}{" "}
              <span className="font-normal text-slate-400">
                x{reservation.quantity}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              {reservation.user?.name} · Pickup{" "}
              {formatDate(reservation.reservationDate)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DueLoanRows({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) {
    return (
      <div className="p-5">
        <EmptyState title="No loans due today or overdue" />
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-200">
      {loans.map((loan) => (
        <div
          key={loan.id}
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {loan.item.name}
            </p>
            <p className="text-xs text-slate-500">
              {loan.user?.name} · Due {formatDate(loan.returnDate)}
            </p>
          </div>
          <Badge tone={loan.status === "OVERDUE" ? "red" : "yellow"}>
            {loan.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function LinkedStatCard({
  to,
  label,
  value,
  tone,
  hint,
}: {
  to: string;
  label: string;
  value: number;
  tone?: "default" | "red" | "green" | "amber";
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
    >
      <StatCard
        label={label}
        value={value}
        tone={tone}
        hint={hint}
        className="h-full transition-colors hover:border-primary-300"
      />
    </Link>
  );
}

function BorrowingHistoryChart({
  history,
}: {
  history: AdminDashboard["borrowingHistory"];
}) {
  const chart = { left: 52, right: 700, top: 22, bottom: 190 };
  const maxUnits = Math.max(1, ...history.map((entry) => entry.units));
  const points = history.map((entry, index) => ({
    ...entry,
    x:
      chart.left +
      (index * (chart.right - chart.left)) / Math.max(1, history.length - 1),
    y: chart.bottom - (entry.units / maxUnits) * (chart.bottom - chart.top),
    label: new Date(`${entry.month}-01T12:00:00Z`).toLocaleDateString(
      undefined,
      { month: "short", timeZone: "UTC" },
    ),
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${chart.left},${chart.bottom} ${line} ${chart.right},${chart.bottom}`;
  const ticks = [maxUnits, Math.round(maxUnits / 2), 0].filter(
    (value, index, values) => values.indexOf(value) === index,
  );

  return (
    <Card>
      <CardHeader title="Borrowing Activity" />
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <p className="mb-2 text-xs text-slate-500">
          Equipment units checked out per month · Last 6 months
        </p>
        <svg
          viewBox="0 0 720 236"
          className="h-56 w-full overflow-visible"
          role="img"
          aria-labelledby="borrowing-history-title borrowing-history-description"
        >
          <title id="borrowing-history-title">Monthly borrowing activity</title>
          <desc id="borrowing-history-description">
            Units checked out during the last six months:{" "}
            {points
              .map((point) => `${point.label}: ${point.units}`)
              .join(", ")}
          </desc>
          {ticks.map((tick) => {
            const y = chart.bottom - (tick / maxUnits) * (chart.bottom - chart.top);
            return (
              <g key={tick}>
                <line
                  x1={chart.left}
                  x2={chart.right}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.14"
                  strokeDasharray="3 5"
                />
                <text
                  x={chart.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[11px] text-slate-500"
                  fill="currentColor"
                >
                  {tick}
                </text>
              </g>
            );
          })}
          <polygon points={area} fill="rgb(37 99 235 / 0.10)" />
          <polyline
            points={line}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point) => (
            <g key={point.month}>
              <circle
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#2563eb"
                stroke="white"
                strokeWidth="2"
              >
                <title>
                  {point.label}: {point.units} units checked out
                </title>
              </circle>
              <text
                x={point.x}
                y={point.y - 12}
                textAnchor="middle"
                className="text-[11px] font-semibold text-slate-600"
                fill="currentColor"
              >
                {point.units}
              </text>
              <text
                x={point.x}
                y={chart.bottom + 25}
                textAnchor="middle"
                className="text-xs text-slate-500"
                fill="currentColor"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

function StudentView({ data }: { data: StudentDashboard }) {
  const { user } = useAuth();
  const [penaltyDismissed, setPenaltyDismissed] = useState(
    () =>
      user != null &&
      localStorage.getItem(PENALTY_ALERT_KEY) === String(user.penaltyPoints),
  );

  function dismissPenalty() {
    if (user) localStorage.setItem(PENALTY_ALERT_KEY, String(user.penaltyPoints));
    setPenaltyDismissed(true);
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0]}`}
        description="Here is an overview of your equipment loans."
        actions={
          <Link to="/catalog">
            <Button variant="secondary">
              <Icon name="arrow-left" className="h-4 w-4" />
              Browse equipment
            </Button>
          </Link>
        }
      />
      {user?.isBlacklisted && (
        <div className="mb-6">
          <Alert tone="error">
            Your borrowing privileges are suspended due to repeated late
            returns. Please contact the equipment office.
          </Alert>
        </div>
      )}
      {!user?.isBlacklisted && user && user.penaltyPoints > 0 &&
        !penaltyDismissed && (
          <div className="mb-6">
            <Alert tone="warning" onDismiss={dismissPenalty}>
              You have {user.penaltyPoints} penalty point(s) from late returns. 6
              points will suspend your borrowing privileges.
            </Alert>
          </div>
        )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Loans" value={data.activeLoans} />
        <StatCard
          label="Due Soon"
          value={data.dueSoonCount}
          tone={data.dueSoonCount > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Overdue"
          value={data.overdueCount}
          tone={data.overdueCount > 0 ? "red" : "default"}
        />
        <StatCard label="Total Requests" value={data.totalRequests} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Due Soon"
            actions={
              <Link to="/my-loans">
                <Button variant="secondary" size="sm">
                  View all
                </Button>
              </Link>
            }
          />
          <LoanRows loans={data.dueSoon} />
        </Card>
        <Card>
          <CardHeader
            title="Recent Requests"
            actions={
              <Link to="/catalog">
                <Button size="sm">Browse equipment</Button>
              </Link>
            }
          />
          <LoanRows loans={data.recent} />
        </Card>
      </div>
    </>
  );
}

function AdminView({ data }: { data: AdminDashboard }) {
  const maxUnits = Math.max(1, ...data.categoryBreakdown.map((c) => c.units));
  return (
    <>
      <PageHeader
        title="Admin Dashboard"
        description="Inventory health and the pending request queue at a glance."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LinkedStatCard
          to="/admin/inventory"
          label="Total Items"
          value={data.totalItems}
          hint={`${data.totalCategories} categories`}
        />
        <LinkedStatCard
          to="/admin/scan"
          label="Currently Borrowed"
          value={data.borrowedCount}
        />
        <LinkedStatCard
          to="/admin/scan"
          label="Overdue"
          value={data.overdueCount}
          tone={data.overdueCount > 0 ? "red" : "default"}
        />
        <LinkedStatCard
          to="/admin/requests"
          label="Pending Requests"
          value={data.pendingRequests}
          tone={data.pendingRequests > 0 ? "amber" : "default"}
          hint={`${data.totalUsers} registered users`}
        />
      </div>
      <div className="mb-6">
        <BorrowingHistoryChart history={data.borrowingHistory} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Pending Request Queue"
              actions={
                <Link to="/admin/requests">
                  <Button variant="secondary" size="sm">
                    Manage requests
                  </Button>
                </Link>
              }
            />
            {data.pendingQueue.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No pending requests"
                  hint="New borrow requests will appear here."
                />
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.pendingQueue.map((l) => (
                  <div key={l.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {l.item.name}{" "}
                        <span className="font-normal text-slate-400">
                          x{l.quantity}
                        </span>
                      </p>
                      <span className="text-xs text-slate-400">
                        {formatDate(l.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {l.user?.name} (
                      {l.user?.department ?? "No department"}) - return by{" "}
                      {formatDate(l.returnDate)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Pending Reservations"
              actions={
                <Link to="/admin/reservations">
                  <Button variant="secondary" size="sm">
                    View reservations
                  </Button>
                </Link>
              }
            />
            <ReservationRows reservations={data.pendingReservations} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Due Today / Overdue"
              actions={
                <Link to="/admin/scan">
                  <Button variant="secondary" size="sm">
                    Open desk
                  </Button>
                </Link>
              }
            />
            <DueLoanRows loans={data.dueLoans} />
          </Card>
          <Card>
            <CardHeader title="Most Borrowed Categories" />
            <div className="space-y-3 p-4 sm:p-5">
              {data.categoryBreakdown.length === 0 && (
                <EmptyState title="No borrow activity yet" />
              )}
              {data.categoryBreakdown.slice(0, 6).map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{c.name}</span>
                    <span className="tabular-nums text-slate-400">
                      {c.units} units
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100">
                    <div
                      className="h-full bg-primary-800"
                      style={{ width: `${(c.units / maxUnits) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader
              title="Low Stock Alerts"
              actions={
                data.lowStockCount > data.lowStock.length ? (
                  <Link to="/admin/inventory">
                    <Button variant="secondary" size="sm">
                      View all
                    </Button>
                  </Link>
                ) : undefined
              }
            />
            {data.lowStock.length === 0 ? (
              <div className="p-5">
                <EmptyState title="All items sufficiently stocked" />
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.lowStock.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">
                        {i.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Alert at {i.lowStockThreshold}
                      </p>
                    </div>
                    <Badge tone={i.availableQuantity === 0 ? "red" : "yellow"}>
                      {i.availableQuantity} left
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState<StudentDashboard | null>(null);
  const [adminData, setAdminData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get<StudentDashboard | AdminDashboard>("/dashboard")
      .then((res) => {
        if (cancelled) return;
        if (res.data.role === "ADMIN") setAdminData(res.data as AdminDashboard);
        else setStudentData(res.data as StudentDashboard);
      })
      .catch((e) => !cancelled && setError(apiErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!studentData && !adminData)
    return (
      <div className="flex justify-center py-20 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    );

  return adminData ? (
    <AdminView data={adminData} />
  ) : (
    <StudentView data={studentData!} />
  );
}
