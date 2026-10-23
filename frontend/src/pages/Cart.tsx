import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import type { BatchCheckoutResponse } from "../types";
import { formatDate, toDateInput } from "../lib/format";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "../components/ui";
import { CategoryIcon } from "../components/CategoryIcon";
import { Icon } from "../components/Icon";

/** Mirrors SUSPEND_BELOW_CREDITS in backend/services/credits.ts. */
function creditsFrom(penaltyPoints: number): number {
  return Math.max(0, 100 - penaltyPoints * 20);
}

export default function Cart() {
  const { user } = useAuth();
  const { lines, count, units, setQuantity, remove, clear } = useCart();

  const tomorrow = toDateInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const today = toDateInput(new Date());

  const [form, setForm] = useState({
    purpose: "",
    dateNeeded: tomorrow,
    returnDate: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ batchId: string; count: number } | null>(
    null,
  );

  const credits = user ? creditsFrom(user.penaltyPoints) : 100;
  const blocked = Boolean(user?.isBlacklisted) || credits < 50;

  const canSubmit = useMemo(
    () => lines.length > 0 && form.purpose.trim().length >= 5 && !!form.returnDate,
    [lines.length, form.purpose, form.returnDate],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post<BatchCheckoutResponse>("/loans/batch", {
        items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        purpose: form.purpose,
        dateNeeded: form.dateNeeded,
        returnDate: form.returnDate || form.dateNeeded,
      });
      setDone({ batchId: res.data.batchId, count: res.data.count });
      clear();
      setForm({ purpose: "", dateNeeded: tomorrow, returnDate: "" });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Borrow Cart"
        description="Request several items in one submission with a shared purpose and dates."
        actions={
          <Link to="/catalog">
            <Button variant="secondary">
              <Icon name="plus" className="h-4 w-4" />
              Add more equipment
            </Button>
          </Link>
        }
      />

      {done && (
        <div className="mb-4">
          <Alert tone="success">
            Submitted {done.count} request{done.count === 1 ? "" : "s"} as one
            group. Track them together under{" "}
            <Link to="/my-loans" className="font-semibold underline">
              My Loans
            </Link>
            .
          </Alert>
        </div>
      )}

      {lines.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            title="Your cart is empty"
            hint="Add equipment from the catalog or an item page, then check out in one go."
          />
          {!done && (
            <div className="mt-4 text-center">
              <Link to="/catalog">
                <Button>Browse equipment</Button>
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,380px]">
          <Card>
            <CardHeader
              title={`Cart (${count} item${count === 1 ? "" : "s"}, ${units} unit${units === 1 ? "" : "s"})`}
              actions={
                <Button variant="ghost" size="sm" onClick={clear}>
                  Clear all
                </Button>
              }
            />
            <div className="divide-y divide-slate-200">
              {lines.map((l) => (
                <div key={l.itemId} className="flex gap-4 px-4 py-4 sm:px-5">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden bg-primary-50 text-primary-300">
                    {l.imageUrl ? (
                      <img
                        src={l.imageUrl}
                        alt={l.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CategoryIcon
                        slug={l.categorySlug}
                        className="h-7 w-7"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/items/${l.itemId}`}
                      className="text-sm font-bold text-slate-800 hover:text-primary-800 hover:underline"
                    >
                      {l.name}
                    </Link>
                    <p className="font-mono text-[11px] text-slate-400">
                      {l.code}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        Qty
                        <Select
                          className="w-20"
                          value={l.quantity}
                          onChange={(e) =>
                            setQuantity(l.itemId, Number(e.target.value))
                          }
                        >
                          {Array.from({ length: l.maxQty }, (_, i) => i + 1).map(
                            (n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ),
                          )}
                        </Select>
                      </label>
                      <span className="text-xs text-slate-400">
                        {l.maxQty} available when added
                      </span>
                    </div>
                  </div>
                  <button
                    className="self-start text-slate-400 hover:text-red-600"
                    onClick={() => remove(l.itemId)}
                    aria-label={`Remove ${l.name} from cart`}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Checkout details" />
            <div className="card-body space-y-4">
              {user?.isBlacklisted && (
                <Alert tone="error">
                  Your borrowing privileges are suspended. Contact the equipment
                  office.
                </Alert>
              )}
              {!user?.isBlacklisted && blocked && (
                <Alert tone="warning">
                  Your borrowing credits are {credits}/100, below the 50
                  minimum. You can fill the cart, but the submission will be
                  blocked until your credits recover.
                </Alert>
              )}
              {error && <Alert tone="error">{error}</Alert>}

              <form onSubmit={onSubmit} className="space-y-4">
                <Field label="Purpose (applies to every item)">
                  <Textarea
                    value={form.purpose}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, purpose: e.target.value }))
                    }
                    placeholder="Briefly describe what you need these for..."
                    required
                    minLength={5}
                    maxLength={300}
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || blocked || !canSubmit}
                >
                  {busy
                    ? "Submitting..."
                    : `Submit ${count} request${count === 1 ? "" : "s"}`}
                </Button>
                <p className="text-xs text-slate-400">
                  All items are submitted together for approval. If any item is
                  unavailable, nothing is submitted.{" "}
                  {form.dateNeeded && form.returnDate
                    ? `Window: ${formatDate(form.dateNeeded)} - ${formatDate(form.returnDate)}.`
                    : ""}
                </p>
              </form>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
