import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiError, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Item } from "../types";
import { conditionTone, formatDate, itemStatusTone, toDateInput } from "../lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { CategoryIcon } from "../components/CategoryIcon";

export default function ItemDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const today = toDateInput(new Date());
  const tomorrow = toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [form, setForm] = useState({
    quantity: "1",
    purpose: "",
    dateNeeded: tomorrow,
    returnDate: "",
  });
  const [resForm, setResForm] = useState({
    quantity: "1",
    reservationDate: tomorrow,
    pickupTime: "",
    returnDate: toDateInput(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)),
    purpose: "",
  });
  const [resError, setResError] = useState("");
  const [resSuccess, setResSuccess] = useState("");
  const [resBusy, setResBusy] = useState(false);
  // A 409 means the window is genuinely taken - that is the only case where
  // joining the waitlist can actually help, so it gates the offer below.
  const [resConflict, setResConflict] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinNotice, setJoinNotice] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  // Matches MAX_AHEAD_DAYS in routes/reservations.ts so the browser explains
  // the limit before the server has to reject the request.
  const maxPickupDate = toDateInput(
    new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<Item>(`/items/${id}`)
      .then((res) => !cancelled && setItem(res.data))
      .catch((e) => !cancelled && setError(apiErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const borrowable = useMemo(
    () =>
      Boolean(user) &&
      !user?.isBlacklisted &&
      item?.status === "AVAILABLE" &&
      (item?.availableQuantity ?? 0) > 0,
    [user, item],
  );

  // A reservation is a hold on a FUTURE date, so it is allowed even when
  // every unit is out right now - that is the whole point of reserving.
  const reservable = useMemo(
    () =>
      Boolean(user) && !user?.isBlacklisted && item?.status === "AVAILABLE",
    [user, item],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSuccess("");
    setBusy(true);
    try {
      await api.post("/loans", {
        itemId: Number(id),
        quantity: Number(form.quantity),
        purpose: form.purpose,
        dateNeeded: form.dateNeeded,
        returnDate: form.returnDate || form.dateNeeded,
      });
      setSuccess("Request submitted. You can track its status under My Loans.");
      setForm({
        quantity: "1",
        purpose: "",
        dateNeeded: tomorrow,
        returnDate: "",
      });
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Nudge the return day forward whenever it would collide with pickup. */
  function onPickupChange(value: string) {
    setResForm((f) => {
      const next = { ...f, reservationDate: value };
      if (!f.returnDate || f.returnDate <= value) {
        next.returnDate = toDateInput(
          new Date(new Date(`${value}T00:00:00`).getTime() + 24 * 60 * 60 * 1000),
        );
      }
      return next;
    });
  }

  async function onReserve(e: FormEvent) {
    e.preventDefault();
    setResError("");
    setResSuccess("");
    setResConflict(false);
    setJoinNotice(null);
    setResBusy(true);
    try {
      await api.post("/reservations", {
        itemId: Number(id),
        quantity: Number(resForm.quantity),
        reservationDate: resForm.reservationDate,
        pickupTime: resForm.pickupTime || undefined,
        returnDate: resForm.returnDate,
        purpose: resForm.purpose,
      });
      setResSuccess("Reservation requested. Track it under My Reservations.");
      setResForm((f) => ({ ...f, quantity: "1", purpose: "", pickupTime: "" }));
    } catch (err) {
      const failure = apiError(err);
      setResError(failure.message);
      setResConflict(failure.status === 409);
    } finally {
      setResBusy(false);
    }
  }

  /** Queue these exact form values for the next free window. */
  async function onJoinWaitlist() {
    setJoining(true);
    setJoinNotice(null);
    try {
      await api.post("/waitlist", {
        itemId: Number(id),
        quantity: Number(resForm.quantity),
        wantedDate: resForm.reservationDate,
        pickupTime: resForm.pickupTime || undefined,
        wantedReturn: resForm.returnDate,
        purpose: resForm.purpose,
      });
      setResError("");
      setJoinNotice({
        tone: "success",
        text: "You're on the waitlist for these dates. The next free window is held for you for 24 hours - watch the bell icon and My Reservations.",
      });
    } catch (err) {
      setJoinNotice({ tone: "error", text: apiErrorMessage(err) });
    } finally {
      setJoining(false);
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!item)
    return (
      <div className="flex justify-center py-20 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    );

  const specs: Array<[string, string]> = [
    ["Item code", item.code],
    ["Category", item.category.name],
    ["Department", item.department ?? "-"],
    ["Total quantity", String(item.totalQuantity)],
    ["Available", String(item.availableQuantity)],
    ...(item.availableQuantity === 0 && item.nextAvailableDate
      ? ([["Next available", formatDate(item.nextAvailableDate)]] as Array<
          [string, string]
        >)
      : []),
  ];

  return (
    <>
      <PageHeader
        title={item.name}
        description={item.description ?? undefined}
        actions={
          <Link to="/catalog">
            <Button variant="secondary">Back to catalog</Button>
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div
            className={`flex h-56 items-center justify-center ${item.availableQuantity === 0 ? "bg-slate-100" : "bg-primary-50"} text-primary-300`}
          >
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <CategoryIcon slug={item.category.slug} className="h-20 w-20" />
            )}
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone={itemStatusTone[item.status] as never}>
                {item.status}
              </Badge>
              <Badge tone={conditionTone[item.condition] as never}>
                Condition: {item.condition}
              </Badge>
              {item.status === "AVAILABLE" && (
                <Badge tone={item.availableQuantity > 0 ? "green" : "red"}>
                  {item.availableQuantity > 0
                    ? `${item.availableQuantity} available`
                    : "Fully borrowed"}
                </Badge>
              )}
            </div>
            <dl className="divide-y divide-slate-200 border border-slate-200">
              {specs.map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between gap-4 px-3 py-2 text-sm"
                >
                  <dt className="font-semibold text-slate-500">{k}</dt>
                  <dd className="text-right text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>

        <Card>
          <CardHeader title="Borrow Request" />
          <div className="card-body space-y-4">
            {!user && (
              <>
                <Alert tone="info">
                  Please sign in to submit a borrow request.
                </Alert>
                <Link to="/login" className="inline-block">
                  <Button>Sign in to borrow</Button>
                </Link>
              </>
            )}
            {user?.isBlacklisted && (
              <Alert tone="error">
                Your borrowing privileges are suspended. Contact the equipment
                office.
              </Alert>
            )}
            {user && !borrowable && !user.isBlacklisted && (
              <Alert tone="warning">
                This item is currently unavailable for borrowing.
              </Alert>
            )}

            {borrowable && (
              <>
                {formError && <Alert tone="error">{formError}</Alert>}
                {success && <Alert tone="success">{success}</Alert>}
                <form onSubmit={onSubmit} className="space-y-4">
                  <Field label="Quantity">
                    <Select
                      value={form.quantity}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, quantity: e.target.value }))
                      }
                    >
                      {Array.from(
                        { length: item.availableQuantity },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Purpose">
                    <Textarea
                      value={form.purpose}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, purpose: e.target.value }))
                      }
                      placeholder="Briefly describe what you need this for..."
                      required
                      minLength={5}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Date needed">
                      <Input
                        type="date"
                        min={today}
                        value={form.dateNeeded}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, dateNeeded: e.target.value }))
                        }
                        required
                      />
                    </Field>
                    <Field label="Return date">
                      <Input
                        type="date"
                        min={form.dateNeeded || today}
                        value={form.returnDate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, returnDate: e.target.value }))
                        }
                        required
                      />
                    </Field>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Submitting..." : "Submit request"}
                  </Button>
                  <p className="text-xs text-slate-400">
                    Requests go to the equipment desk for approval. You will be
                    notified of the decision.
                  </p>
                </form>
              </>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Reserve for a future date"
            actions={
              <Link to="/my-reservations">
                <Button variant="secondary" size="sm">
                  My reservations
                </Button>
              </Link>
            }
          />
          <div className="card-body space-y-4">
            {!user && (
              <Alert tone="info">Sign in to reserve equipment.</Alert>
            )}
            {user?.isBlacklisted && (
              <Alert tone="error">
                Your borrowing privileges are suspended. Contact the equipment
                office.
              </Alert>
            )}
            {user && !reservable && (
              <Alert tone="warning">
                Reservations are only available while this item is in service.
              </Alert>
            )}

            {reservable && (
              <>
                {resError && <Alert tone="error">{resError}</Alert>}
                {resSuccess && <Alert tone="success">{resSuccess}</Alert>}
                {resConflict && joinNotice?.tone !== "success" && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-700">
                      Those dates are already taken.
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Join the waitlist with this exact window and the next
                      free slot will be held for you for 24 hours before it
                      passes to the next person in line.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button
                        variant="secondary"
                        onClick={onJoinWaitlist}
                        disabled={joining}
                      >
                        {joining ? "Joining..." : "Join the waitlist"}
                      </Button>
                      <Link
                        to="/my-reservations"
                        className="text-xs font-semibold text-primary-800 hover:underline"
                      >
                        Track it under My Reservations
                      </Link>
                    </div>
                  </div>
                )}
                {joinNotice && (
                  <Alert tone={joinNotice.tone}>{joinNotice.text}</Alert>
                )}
                {item.availableQuantity === 0 && (
                  <Alert tone="info">
                    Every unit is out right now
                    {item.nextAvailableDate
                      ? ` (back ${formatDate(item.nextAvailableDate)})`
                      : ""}
                    . Reserving holds the next free window for you.
                  </Alert>
                )}
                <form
                  onSubmit={onReserve}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-3"
                >
                  <Field label="Pick up on">
                    <Input
                      type="date"
                      min={today}
                      max={maxPickupDate}
                      value={resForm.reservationDate}
                      onChange={(e) => onPickupChange(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Preferred time (optional)">
                    <Input
                      type="time"
                      value={resForm.pickupTime}
                      onChange={(e) =>
                        setResForm((f) => ({
                          ...f,
                          pickupTime: e.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field label="Return by">
                    <Input
                      type="date"
                      min={toDateInput(
                        new Date(
                          new Date(
                            `${resForm.reservationDate}T00:00:00`,
                          ).getTime() +
                            24 * 60 * 60 * 1000,
                        ),
                      )}
                      value={resForm.returnDate}
                      onChange={(e) =>
                        setResForm((f) => ({
                          ...f,
                          returnDate: e.target.value,
                        }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Quantity">
                    <Select
                      value={resForm.quantity}
                      onChange={(e) =>
                        setResForm((f) => ({
                          ...f,
                          quantity: e.target.value,
                        }))
                      }
                    >
                      {Array.from(
                        { length: Math.max(item.totalQuantity, 1) },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Purpose">
                      <Textarea
                        value={resForm.purpose}
                        onChange={(e) =>
                          setResForm((f) => ({
                            ...f,
                            purpose: e.target.value,
                          }))
                        }
                        placeholder="What is this reservation for?"
                        required
                        minLength={5}
                        maxLength={300}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-col gap-3 sm:col-span-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-400">
                      The equipment desk approves or rejects each hold. You can
                      cancel a pending reservation at any time.
                    </p>
                    <Button type="submit" disabled={resBusy}>
                      {resBusy ? "Reserving..." : "Reserve item"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
