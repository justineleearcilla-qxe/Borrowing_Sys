import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { AdminDashboard, Loan, StudentDashboard } from "../types";
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

function StudentView({ data }: { data: StudentDashboard }) {
  const { user } = useAuth();
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
      {!user?.isBlacklisted && user && user.penaltyPoints > 0 && (
        <div className="mb-6">
          <Alert tone="warning">
            You have {user.penaltyPoints} penalty point(s) from late returns. 6
            points will suspend your borrowing privileges.
          </Alert>
        </div>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Loans" value={data.activeLoans} />
        <StatCard
          label="Due Soon / Overdue"
          value={data.dueSoon.length + data.overdueCount}
          tone={
            data.dueSoon.length + data.overdueCount > 0 ? "amber" : "default"
          }
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
        actions={
          <Link to="/catalog">
            <Button variant="secondary">
              <Icon name="arrow-left" className="h-4 w-4" />
              Browse equipment
            </Button>
          </Link>
        }
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
