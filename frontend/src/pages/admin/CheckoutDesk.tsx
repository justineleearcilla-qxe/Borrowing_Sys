import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../../api/client";
import type { Item, Loan, Reservation } from "../../types";
import { formatDate, formatDateTime, loanStatusTone } from "../../lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../../components/ui";

const OPEN_STATUSES = ["PENDING", "APPROVED", "BORROWED", "OVERDUE"] as const;

interface DeskSearchResult {
  item: Item;
  openLoans: Loan[];
}

function localDateKey(value: string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function LoanActions({
  loan,
  busy,
  onApprove,
  onCheckout,
  onQuickReturn,
  onReturn,
}: {
  loan: Loan;
  busy: boolean;
  onApprove: (loan: Loan) => void;
  onCheckout: (loan: Loan) => void;
  onQuickReturn: (loan: Loan) => void;
  onReturn: (loan: Loan) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {loan.status === "PENDING" && (
        <Button
          variant="success"
          size="sm"
          disabled={busy}
          onClick={() => onApprove(loan)}
        >
          Approve
        </Button>
      )}
      {loan.status === "APPROVED" && (
        <Button size="sm" disabled={busy} onClick={() => onCheckout(loan)}>
          Check out
        </Button>
      )}
      {(loan.status === "BORROWED" || loan.status === "OVERDUE") && (
        <>
          <Button
            variant="success"
            size="sm"
            disabled={busy}
            onClick={() => onQuickReturn(loan)}
          >
            Quick return
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onReturn(loan)}
          >
            Return with outcome
          </Button>
        </>
      )}
    </div>
  );
}

export default function AdminCheckoutDesk() {
  const searchPlaceholder =
    "Search item name, item code, or borrower name...";
  const [todayLoans, setTodayLoans] = useState<Loan[]>([]);
  const [todayReservations, setTodayReservations] = useState<Reservation[]>([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState("");
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DeskSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [returnLoan, setReturnLoan] = useState<Loan | null>(null);
  const [returnOutcome, setReturnOutcome] = useState("OK");
  const [returnNote, setReturnNote] = useState("");

  const todayKey = localDateKey(new Date());
  const selectedResult =
    searchResults.find((result) => result.item.id === selectedItemId) ?? null;

  async function loadToday() {
    setTodayLoading(true);
    setTodayError("");
    try {
      const [approved, borrowed, overdue, reservations] = await Promise.all([
        api.get<Loan[]>("/loans", { params: { status: "APPROVED" } }),
        api.get<Loan[]>("/loans", { params: { status: "BORROWED" } }),
        api.get<Loan[]>("/loans", { params: { status: "OVERDUE" } }),
        api.get<Reservation[]>("/reservations", {
          params: { status: "APPROVED" },
        }),
      ]);
      const readyLoans = approved.data.filter(
        (loan) => localDateKey(loan.dateNeeded) <= todayKey,
      );
      const dueLoans = borrowed.data.filter(
        (loan) => localDateKey(loan.returnDate) <= todayKey,
      );
      const lateLoans = overdue.data.filter(
        (loan) => loan.status === "OVERDUE",
      );
      setTodayLoans([...readyLoans, ...dueLoans, ...lateLoans]);
      setTodayReservations(
        reservations.data.filter(
          (reservation) =>
            localDateKey(reservation.reservationDate) <= todayKey,
        ),
      );
    } catch (error) {
      setTodayError(apiErrorMessage(error));
    } finally {
      setTodayLoading(false);
    }
  }

  useEffect(() => {
    void loadToday();
  }, []);

  useEffect(() => {
    const term = query.trim();
    setSelectedItemId(null);
    if (!term) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const response = await api.get<DeskSearchResult[]>("/items/desk-search", {
          params: { q: term },
        });
        if (!cancelled) setSearchResults(response.data);
      } catch (error) {
        if (!cancelled) setSearchError(apiErrorMessage(error));
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function refreshSearch() {
    const term = query.trim();
    if (!term) return;
    try {
      const response = await api.get<DeskSearchResult[]>("/items/desk-search", {
        params: { q: term },
      });
      setSearchResults(response.data);
      if (
        selectedItemId !== null &&
        !response.data.some((result) => result.item.id === selectedItemId)
      ) {
        setSelectedItemId(null);
      }
    } catch (error) {
      setSearchError(apiErrorMessage(error));
    }
  }

  async function performAction(
    key: string,
    action: () => Promise<unknown>,
    message: string,
  ) {
    setBusyKey(key);
    setTodayError("");
    setSearchError("");
    setActionError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await Promise.all([loadToday(), refreshSearch()]);
    } catch (error) {
      setActionError(apiErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  }

  const approve = (loan: Loan) =>
    performAction(
      `loan-${loan.id}`,
      () => api.patch(`/loans/${loan.id}/decide`, { action: "approve" }),
      `Request #${loan.id} approved.`,
    );

  const checkout = (loan: Loan) =>
    performAction(
      `loan-${loan.id}`,
      () => api.patch(`/loans/${loan.id}/checkout`),
      `${loan.item.name} checked out to ${loan.user?.name}.`,
    );

  const quickReturn = (loan: Loan) =>
    performAction(
      `loan-${loan.id}`,
      () => api.patch(`/loans/${loan.id}/return`, { outcome: "OK" }),
      `${loan.item.name} returned by ${loan.user?.name}.`,
    );

  async function submitReturn() {
    if (!returnLoan) return;
    const loan = returnLoan;
    setReturnLoan(null);
    setReturnNote("");
    setReturnOutcome("OK");
    await performAction(
      `loan-${loan.id}`,
      () =>
        api.patch(`/loans/${loan.id}/return`, {
          outcome: returnOutcome,
          note: returnNote || undefined,
        }),
      `${loan.item.name} returned (${returnOutcome}).`,
    );
  }

  const pickupReservation = (reservation: Reservation) =>
    performAction(
      `reservation-${reservation.id}`,
      () => api.patch(`/reservations/${reservation.id}/pickup`),
      `${reservation.item.name} picked up by ${reservation.user?.name}.`,
    );

  function openReturn(loan: Loan) {
    setReturnLoan(loan);
    setReturnOutcome("OK");
    setReturnNote("");
  }

  function renderLoan(loan: Loan) {
    return (
      <div
        key={loan.id}
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {loan.item.name} <span className="font-normal">·</span>{" "}
            {loan.user?.name}
          </p>
          <p className="text-xs text-slate-500">
            {loan.item.code} · Qty {loan.quantity} · Due{" "}
            {formatDate(loan.returnDate)}
          </p>
          <Badge tone={loanStatusTone[loan.status] as never} className="mt-1">
            {loan.status}
          </Badge>
        </div>
        <LoanActions
          loan={loan}
          busy={busyKey === `loan-${loan.id}`}
          onApprove={(value) => void approve(value)}
          onCheckout={(value) => void checkout(value)}
          onQuickReturn={(value) => void quickReturn(value)}
          onReturn={openReturn}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Check-out / Return"
        description="Find equipment or a borrower to review open loans and process desk activity."
      />
      {notice && (
        <div className="mb-4">
          <Alert tone="success" onDismiss={() => setNotice("")}>
            {notice}
          </Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert tone="error">{actionError}</Alert>
        </div>
      )}

      <Card>
        <CardHeader title="Today" />
        {todayError && (
          <div className="p-4">
            <Alert tone="error">{todayError}</Alert>
          </div>
        )}
        {todayLoading ? (
          <div className="flex justify-center py-10 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : todayLoans.length === 0 && todayReservations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Nothing needs attention today"
              hint="Approved pickups, due-today loans, and overdue loans will appear here."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {todayReservations.map((reservation) => (
              <div
                key={`reservation-${reservation.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {reservation.item.name}{" "}
                    <span className="font-normal">·</span>{" "}
                    {reservation.user?.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {reservation.item.code} · Qty {reservation.quantity} ·
                    Pickup {formatDate(reservation.reservationDate)}
                    {reservation.pickupTime
                      ? ` at ${reservation.pickupTime}`
                      : ""}
                  </p>
                  <Badge tone="blue" className="mt-1">
                    Approved reservation
                  </Badge>
                </div>
                <Button
                  size="sm"
                  disabled={busyKey === `reservation-${reservation.id}`}
                  onClick={() => void pickupReservation(reservation)}
                >
                  {busyKey === `reservation-${reservation.id}`
                    ? "Processing..."
                    : "Mark picked up"}
                </Button>
              </div>
            ))}
            {todayLoans.map(renderLoan)}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Find an item or borrower"
          actions={
            <div className="w-full sm:w-auto">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search by item name, item code, or borrower name"
                style={{
                  width: `min(100%, ${searchPlaceholder.length}ch)`,
                }}
              />
            </div>
          }
        />
        <div className="card-body space-y-4">
          {searchError && <Alert tone="error">{searchError}</Alert>}
          {searchLoading && (
            <div className="flex justify-center py-6 text-primary-800">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {!searchLoading && query.trim() && searchResults.length === 0 && (
            <EmptyState
              title="No matching items"
              hint="Try another item name, code, or borrower name."
            />
          )}
          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,0.8fr),minmax(0,1.5fr)]">
              <div className="divide-y divide-slate-200 border border-slate-200">
                {searchResults.map(({ item, openLoans }) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700 ${
                      selectedItemId === item.id
                        ? "bg-primary-50 text-primary-950"
                        : "text-slate-800"
                    }`}
                    aria-pressed={selectedItemId === item.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-slate-500">
                        {item.code}
                      </span>
                    </span>
                    <Badge tone={openLoans.length ? "blue" : "gray"}>
                      {openLoans.length} open
                    </Badge>
                  </button>
                ))}
              </div>
              <div className="min-w-0 border border-slate-200">
                {selectedResult ? (
                  <>
                    <div className="border-b border-slate-200 px-4 py-3">
                      <h2 className="text-sm font-bold text-slate-800">
                        {selectedResult.item.name}
                      </h2>
                      <p className="font-mono text-xs text-slate-500">
                        {selectedResult.item.code}
                      </p>
                    </div>
                    {selectedResult.openLoans.length === 0 ? (
                      <div className="p-4">
                        <EmptyState
                          title="No open loans"
                          hint="This item has no pending, approved, borrowed, or overdue loans."
                        />
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {selectedResult.openLoans.map(renderLoan)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4">
                    <EmptyState
                      title="Select an item"
                      hint="Its open loans and available desk actions will appear here."
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={Boolean(returnLoan)}
        onClose={() => setReturnLoan(null)}
        title={`Process return #${returnLoan?.id ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnLoan(null)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={busyKey === `loan-${returnLoan?.id}`}
              onClick={() => void submitReturn()}
            >
              Confirm return
            </Button>
          </>
        }
      >
        <Field label="Return outcome">
          <Select
            value={returnOutcome}
            onChange={(event) => setReturnOutcome(event.target.value)}
          >
            <option value="OK">OK - no issues</option>
            <option value="DAMAGED">Damaged</option>
            <option value="LOST">Lost (remove from inventory)</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Textarea
            value={returnNote}
            onChange={(event) => setReturnNote(event.target.value)}
            placeholder="Details about the return or damage..."
          />
        </Field>
      </Modal>
    </>
  );
}
