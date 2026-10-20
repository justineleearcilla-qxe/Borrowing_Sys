import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import type { Loan } from "../types";
import {
  daysUntil,
  formatDate,
} from "../lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Spinner,
} from "../components/ui";
import { Icon } from "../components/Icon";

export default function MyLoans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "pending" | "history">("active");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    api
      .get<Loan[]>("/loans/mine")
      .then((res) => setLoans(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function cancel(id: number) {
    if (!window.confirm("Cancel this pending request?")) return;
    setCancellingId(id);
    try {
      await api.delete(`/loans/${id}`);
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setCancellingId(null);
    }
  }

  async function returnLoan(id: number) {
    if (!window.confirm("Mark this equipment as returned?")) return;
    setReturningId(id);
    setError("");
    try {
      await api.patch(`/loans/${id}/return`, { outcome: "OK" });
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setReturningId(null);
    }
  }

  const active = useMemo(
    () =>
      loans.filter(
        (l) =>
          !["PENDING", "RETURNED", "REJECTED"].includes(l.status),
      ),
    [loans],
  );
  const pending = useMemo(
    () => loans.filter((l) => l.status === "PENDING"),
    [loans],
  );
  const history = useMemo(
    () => loans.filter((l) => ["RETURNED", "REJECTED"].includes(l.status)),
    [loans],
  );
  const shown = tab === "active" ? active : tab === "pending" ? pending : history;

  return (
    <>
      <PageHeader
        title="My Loans"
        description="Track your borrow requests and their current status."
        actions={
          <Link to="/catalog">
            <Button variant="secondary">
              <Icon name="arrow-left" className="h-4 w-4" />
              Browse equipment
            </Button>
          </Link>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex gap-0">
        {(
          [
            ["active", `Active (${active.length})`],
            ["pending", `Pending (${pending.length})`],
            ["history", `History (${history.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-primary-800 border-b-white bg-white text-primary-800"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title={
            tab === "active"
              ? "Active loans"
              : tab === "pending"
                ? "Pending requests"
                : "Returned and rejected"
          }
        />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                tab === "active"
                  ? "No active loans"
                  : tab === "pending"
                    ? "No pending requests"
                    : "No history yet"
              }
              hint="Requests you submit will show up here."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {shown.map((l) => {
              const overdue = l.status === "OVERDUE";
              const statusTone = {
                PENDING: "yellow",
                APPROVED: "blue",
                REJECTED: "gray",
                BORROWED: "blue",
                RETURNED: "gray",
                OVERDUE: "red",
              }[l.status] as "yellow" | "blue" | "gray" | "red";
              return (
                <div
                  key={l.id}
                  className={`px-4 py-4 sm:px-5 ${overdue ? "border-l-4 border-l-red-600" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/items/${l.item.id}`}
                        className="text-base font-semibold text-slate-800 hover:text-primary-900 hover:underline"
                      >
                        {l.item.name}
                      </Link>
                      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Due date
                      </p>
                      <p
                        className={`text-sm font-bold ${
                          overdue ? "text-red-700" : "text-slate-800"
                        }`}
                      >
                        {formatDate(l.returnDate)}
                        {overdue &&
                          ` · ${Math.abs(daysUntil(l.returnDate))} day(s) late`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Quantity: {l.quantity} · Date needed:{" "}
                        {formatDate(l.dateNeeded)}
                      </p>
                      <p className="mt-1 max-w-xl text-xs italic text-slate-500">
                        Purpose: {l.purpose}
                      </p>
                      {l.remarks && (
                        <p className="mt-1 max-w-xl text-xs text-slate-500">
                          Remarks: {l.remarks}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={statusTone}>
                        {l.status}
                      </Badge>
                      {l.status === "PENDING" && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => cancel(l.id)}
                          disabled={cancellingId === l.id}
                        >
                          {cancellingId === l.id ? "Cancelling..." : "Cancel"}
                        </Button>
                      )}
                      {(l.status === "BORROWED" || l.status === "OVERDUE") && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => returnLoan(l.id)}
                          disabled={returningId === l.id}
                        >
                          {returningId === l.id
                            ? "Returning..."
                            : "Mark returned"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
