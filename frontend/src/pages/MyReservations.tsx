import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import type { Reservation, ReservationStatus, WaitlistEntry } from "../types";
import {
  formatClock,
  formatDate,
  formatDateTime,
  formatTimeLeft,
  reservationStatusTone,
  waitlistStatusTone,
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

const ACTIVE_STATUSES: ReservationStatus[] = ["PENDING", "APPROVED"];

export default function MyReservations() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"upcoming" | "history" | "waitlist">(
    "upcoming",
  );
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<Reservation[]>("/reservations/mine"),
      api.get<WaitlistEntry[]>("/waitlist/mine"),
    ])
      .then(([res, wait]) => {
        setReservations(res.data);
        setWaitlist(wait.data);
      })
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function cancel(id: number) {
    if (!window.confirm("Cancel this reservation?")) return;
    setCancellingId(id);
    setError("");
    setNotice("");
    try {
      await api.patch(`/reservations/${id}/cancel`);
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setCancellingId(null);
    }
  }

  /** Turn an offered slot into a PENDING reservation. */
  async function claim(id: number) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await api.post(`/waitlist/${id}/claim`);
      setNotice(
        "Slot claimed - your reservation is waiting for approval. See the Upcoming tab.",
      );
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  /** Step out of the queue (frees any slot this entry was holding). */
  async function leave(id: number) {
    if (!window.confirm("Leave the waitlist queue?")) return;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await api.patch(`/waitlist/${id}/leave`);
      setNotice("You have left the queue.");
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = useMemo(
    () => reservations.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [reservations],
  );
  const history = useMemo(
    () => reservations.filter((r) => !ACTIVE_STATUSES.includes(r.status)),
    [reservations],
  );
  const shown = tab === "upcoming" ? upcoming : history;

  return (
    <>
      <PageHeader
        title="My Reservations"
        description="Hold a specific unit for the date you need it."
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
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="mb-4 flex gap-0">
        {(
          [
            ["upcoming", `Upcoming (${upcoming.length})`],
            ["history", `History (${history.length})`],
            ["waitlist", `Waitlist (${waitlist.length})`],
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
            tab === "upcoming"
              ? "Upcoming and awaiting approval"
              : tab === "waitlist"
                ? "Queued waitlist requests"
                : "Past holds"
          }
        />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : tab === "waitlist" && waitlist.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Not on any waitlist"
              hint="When the dates you want are taken, open the item and join the waitlist - the next free slot is held for you for 24 hours."
            />
          </div>
        ) : tab === "waitlist" ? (
          <div className="divide-y divide-slate-200">
            {waitlist.map((w) => (
              <div key={w.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/items/${w.item.id}`}
                      className="text-sm font-bold text-slate-800 hover:text-primary-800 hover:underline"
                    >
                      {w.item.name}
                    </Link>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">
                      {w.item.code}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      Pickup: {formatDate(w.wantedDate)}
                      {w.pickupTime && <> at {formatClock(w.pickupTime)}</>}
                      {" - Return by: "}
                      <span className="font-semibold">
                        {formatDate(w.wantedReturn)}
                      </span>
                      {" - Quantity: "}
                      {w.quantity}
                    </p>
                    <p className="mt-1 max-w-xl text-xs italic text-slate-500">
                      Purpose: {w.purpose}
                    </p>
                    {w.status === "WAITING" && w.position != null && (
                      <p className="mt-1 text-xs font-semibold text-slate-600">
                        You are #{w.position} in line for these dates.
                      </p>
                    )}
                    {w.status === "OFFERED" && w.offerExpiresAt && (
                      <p className="mt-1 text-xs font-semibold text-primary-800">
                        A slot is held for you - claim by{" "}
                        {formatDateTime(w.offerExpiresAt)} (
                        {formatTimeLeft(w.offerExpiresAt)}).
                      </p>
                    )}
                    {w.status === "CLAIMED" && (
                      <p className="mt-1 text-xs text-slate-500">
                        Claimed - the reservation is in the Upcoming tab.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={waitlistStatusTone[w.status] as never}>
                      {w.status === "WAITING" && w.position != null
                        ? `WAITING #${w.position}`
                        : w.status}
                    </Badge>
                    <div className="flex gap-2">
                      {w.status === "OFFERED" && (
                        <Button
                          size="sm"
                          onClick={() => claim(w.id)}
                          disabled={busyId === w.id}
                        >
                          {busyId === w.id ? "Claiming..." : "Claim now"}
                        </Button>
                      )}
                      {(w.status === "WAITING" || w.status === "OFFERED") && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => leave(w.id)}
                          disabled={busyId === w.id}
                        >
                          Leave queue
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={tab === "upcoming" ? "No reservations yet" : "No history"}
              hint="Open any item in the catalog to reserve it for a future date."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {shown.map((r) => (
              <div key={r.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/items/${r.item.id}`}
                      className="text-sm font-bold text-slate-800 hover:text-primary-800 hover:underline"
                    >
                      {r.item.name}
                    </Link>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">
                      {r.item.code}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      Pickup: {formatDate(r.reservationDate)}
                      {r.pickupTime && <> at {formatClock(r.pickupTime)}</>}
                      {" - Return by: "}
                      <span className="font-semibold">
                        {formatDate(r.returnDate)}
                      </span>
                      {" - Quantity: "}
                      {r.quantity}
                    </p>
                    <p className="mt-1 max-w-xl text-xs italic text-slate-500">
                      Purpose: {r.purpose}
                    </p>
                    {r.remarks && (
                      <p className="mt-1 max-w-xl text-xs text-slate-500">
                        Remarks: {r.remarks}
                      </p>
                    )}
                    {r.status === "COMPLETED" && r.loanId && (
                      <p className="mt-1 text-xs text-slate-500">
                        Converted to a loan - track it under{" "}
                        <Link
                          to="/my-loans"
                          className="font-semibold text-primary-800 underline"
                        >
                          My Loans
                        </Link>
                        .
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={reservationStatusTone[r.status] as never}>
                      {r.status}
                    </Badge>
                    {r.status === "PENDING" && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => cancel(r.id)}
                        disabled={cancellingId === r.id}
                      >
                        {cancellingId === r.id ? "Cancelling..." : "Cancel"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
