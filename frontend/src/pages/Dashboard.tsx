import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { AdminDashboard, Loan, StudentDashboard } from "../types";
import { formatDate, isDueSoon, loanStatusTone } from "../lib/format";
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

/** Remembers a dismissed penalty alert until the penalty count changes. */
const PENALTY_ALERT_KEY = "equiphub.dismissedPenaltyAlert";

function LoanRows({
  loans,
  overdueFirst = false,
}: {
  loans: Loan[];
  overdueFirst?: boolean;
}) {
  if (loans.length === 0) return <EmptyState title="Nothing here yet" />;
  const visibleLoans = overdueFirst
    ? [...loans].sort((a, b) => {
        if (a.status === "OVERDUE" && b.status !== "OVERDUE") return -1;
        if (b.status === "OVERDUE" && a.status !== "OVERDUE") return 1;
        return new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
      })
    : loans;
  return (
    <div className="divide-y divide-slate-200">
      {visibleLoans.map((l) => (
        <div
          key={l.id}
          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 ${
            overdueFirst
              ? `border-l-4 ${
                  l.status === "OVERDUE"
                    ? "border-l-red-600"
                    : "border-l-transparent"
                }`
              : ""
          }`}
        >
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-800">
              {l.item.name}
            </p>
            {overdueFirst ? (
              <p className="mt-1 text-xs text-slate-500">
                Qty {l.quantity} · Needed {formatDate(l.dateNeeded)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Qty {l.quantity} · Return by {formatDate(l.returnDate)}
              </p>
            )}
          </div>
          {overdueFirst ? (
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {l.status === "OVERDUE" ? "Overdue" : "Due"}
              </p>
              <p
                className={`text-sm font-semibold ${
                  l.status === "OVERDUE" ? "text-red-700" : "text-slate-800"
                }`}
              >
                {formatDate(l.returnDate)}
              </p>
            </div>
          ) : (
            <Badge className="status-badge" tone={loanStatusTone[l.status] as never}>{l.status}</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

function StudentView({
  data,
  loans,
}: {
  data: StudentDashboard;
  loans: Loan[];
}) {
  const { user } = useAuth();
  const dueSoonCount = loans.filter((loan) =>
    isDueSoon(loan.status, loan.returnDate),
  ).length;
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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active loans" value={data.activeLoans} />
        <StatCard
          label="Pending"
          value={loans.filter((loan) => loan.status === "PENDING").length}
          tone={
            loans.some((loan) => loan.status === "PENDING")
              ? "amber"
              : "default"
          }
        />
        <StatCard
          label="Due soon"
          value={dueSoonCount}
          tone={dueSoonCount > 0 ? "amber" : "default"}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming due dates"
            actions={
              <Link to="/my-loans">
                <Button variant="secondary" size="sm">
                  View all
                </Button>
              </Link>
            }
          />
          <LoanRows loans={data.dueSoon} overdueFirst />
        </Card>
        <Card>
          <CardHeader title="Recent Requests" />
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
        <StatCard
          label="Total Items"
          value={data.totalItems}
          hint={`${data.totalCategories} categories`}
        />
        <StatCard label="Currently Borrowed" value={data.borrowedCount} />
        <StatCard
          label="Overdue"
          value={data.overdueCount}
          tone={data.overdueCount > 0 ? "red" : "default"}
        />
        <StatCard
          label="Pending Requests"
          value={data.pendingRequests}
          tone={data.pendingRequests > 0 ? "amber" : "default"}
          hint={`${data.totalUsers} registered users`}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    {l.user?.name} ({l.user?.department ?? "No department"}) -
                    return by {formatDate(l.returnDate)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="space-y-6">
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
            <CardHeader title="Low Stock Alerts" />
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
                    <p className="text-sm font-medium text-slate-700">
                      {i.name}
                    </p>
                    <Badge className="status-badge" tone={i.availableQuantity === 0 ? "red" : "yellow"}>
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
  const [studentLoans, setStudentLoans] = useState<Loan[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loansRequest =
      user?.role === "ADMIN"
        ? Promise.resolve(null)
        : api.get<Loan[]>("/loans/mine");
    Promise.all([
      api.get<StudentDashboard | AdminDashboard>("/dashboard"),
      loansRequest,
    ])
      .then(([res, loansRes]) => {
        if (cancelled) return;
        if (res.data.role === "ADMIN") {
          setAdminData(res.data as AdminDashboard);
        } else {
          setStudentData(res.data as StudentDashboard);
          setStudentLoans(loansRes?.data ?? []);
        }
      })
      .catch((e) => !cancelled && setError(apiErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

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
    <StudentView data={studentData!} loans={studentLoans} />
  );
}
