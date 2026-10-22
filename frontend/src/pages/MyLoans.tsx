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

type LoanGroup =
  | { kind: "single"; loan: Loan }
  | { kind: "batch"; batchId: string; loans: Loan[] };

/** Collapse loans sharing a batchId (one cart checkout) into a single group. */
function groupLoans(loans: Loan[]): LoanGroup[] {
  const out: LoanGroup[] = [];
  const batches = new Map<string, Extract<LoanGroup, { kind: "batch" }>>();
  for (const loan of loans) {
    if (!loan.batchId) {
      out.push({ kind: "single", loan });
      continue;
    }
    const existing = batches.get(loan.batchId);
    if (existing) {
      existing.loans.push(loan);
      continue;
    }
    const group: Extract<LoanGroup, { kind: "batch" }> = {
      kind: "batch",
      batchId: loan.batchId,
      loans: [loan],
    };
    batches.set(loan.batchId, group);
    out.push(group);
  }
  return out;
}

function LoanRow({
  loan,
  cancellingId,
  returningId,
  onCancel,
  onReturn,
}: {
  loan: Loan;
  cancellingId: number | null;
  returningId: number | null;
  onCancel: (id: number) => void;
  onReturn: (id: number) => void;
}) {
  const due = isDueSoon(loan.status, loan.returnDate);
  const overdue = loan.status === "OVERDUE";
  return (
    <div
      className={`px-4 py-4 sm:px-5 ${overdue ? "border-l-4 border-l-red-600" : due ? "border-l-4 border-l-amber-400" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/items/${loan.item.id}`}
            className="text-sm font-bold text-slate-800 hover:text-primary-800 hover:underline"
          >
            {loan.item.name}
          </Link>
          <span className="ml-2 font-mono text-[11px] text-slate-400">
            {loan.item.code}
          </span>
          <p className="mt-1 text-xs text-slate-500">
            Quantity: {loan.quantity} - Date needed:{" "}
            {formatDate(loan.dateNeeded)} - Return by:{" "}
            <span
              className={
                overdue
                  ? "font-bold text-red-600"
                  : due
                    ? "font-bold text-amber-600"
                    : ""
              }
            >
              {formatDate(loan.returnDate)}
            </span>
            {overdue && ` (${Math.abs(daysUntil(loan.returnDate))} day(s) late)`}
            {due && !overdue && " (due soon)"}
          </p>
          <p className="mt-1 max-w-xl text-xs italic text-slate-500">
            Purpose: {loan.purpose}
          </p>
          {loan.remarks && (
            <p className="mt-1 max-w-xl text-xs text-slate-500">
              Remarks: {loan.remarks}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={loanStatusTone[loan.status] as never}>
            {loan.status}
          </Badge>
          {loan.status === "PENDING" && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onCancel(loan.id)}
              disabled={cancellingId === loan.id}
            >
              {cancellingId === loan.id ? "Cancelling..." : "Cancel"}
            </Button>
          )}
          {(loan.status === "BORROWED" || loan.status === "OVERDUE") && (
            <Button
              variant="success"
              size="sm"
              onClick={() => onReturn(loan.id)}
              disabled={returningId === loan.id}
            >
              {returningId === loan.id ? "Returning..." : "Mark returned"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

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
<<<<<<< HEAD
  const shown = tab === "active" ? active : tab === "pending" ? pending : history;
=======
  const shown = tab === "active" ? active : history;
  const groups = useMemo(() => groupLoans(shown), [shown]);
>>>>>>> origin/main

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
<<<<<<< HEAD
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
=======
            {groups.map((g) =>
              g.kind === "single" ? (
                <LoanRow
                  key={g.loan.id}
                  loan={g.loan}
                  cancellingId={cancellingId}
                  returningId={returningId}
                  onCancel={cancel}
                  onReturn={returnLoan}
                />
              ) : (
                <div key={g.batchId} className="bg-primary-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-primary-50 px-4 py-2 sm:px-5">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary-800">
                      <Icon name="cart" className="h-3.5 w-3.5" />
                      Multi-item request - {g.loans.length} items
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Submitted {formatDate(g.loans[0].createdAt)}
                    </p>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {g.loans.map((l) => (
                      <LoanRow
                        key={l.id}
                        loan={l}
                        cancellingId={cancellingId}
                        returningId={returningId}
                        onCancel={cancel}
                        onReturn={returnLoan}
                      />
                    ))}
>>>>>>> origin/main
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Card>
    </>
  );
}
