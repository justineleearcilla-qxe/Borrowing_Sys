import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import type { Reservation, ReservationStatus } from "../types";
import {
  formatClock,
  formatDate,
  reservationStatusTone,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    api
      .get<Reservation[]>("/reservations/mine")
      .then((res) => setReservations(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function cancel(id: number) {
    if (!window.confirm("Cancel this reservation?")) return;
    setCancellingId(id);
    setError("");
    try {
      await api.patch(`/reservations/${id}/cancel`);
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setCancellingId(null);
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

      <div className="mb-4 flex gap-0">
        {(
          [
            ["upcoming", `Upcoming (${upcoming.length})`],
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
            tab === "upcoming" ? "Upcoming and awaiting approval" : "Past holds"
          }
        />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
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
