import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Item } from "../types";
import { toDateInput } from "../lib/format";
import {
  Alert,
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
import { ItemImage } from "../components/ItemImage";

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
      item?.condition !== "DAMAGED" &&
      (item?.availableQuantity ?? 0) > 0,
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

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!item)
    return (
      <div className="flex justify-center py-20 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    );

  const available =
    item.status === "AVAILABLE" &&
    item.condition !== "DAMAGED" &&
    item.availableQuantity > 0;
  const lowStock =
    available &&
    (item.availableQuantity < 5 ||
      (item.totalQuantity > 0 &&
        item.availableQuantity / item.totalQuantity <= 0.2));
  const availability = !available
    ? "Unavailable"
    : lowStock
      ? `Only ${item.availableQuantity} left`
      : `${item.availableQuantity} available`;

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
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <ItemImage
            imageUrl={item.imageUrl}
            categorySlug={item.category.slug}
            alt={item.name}
            className="aspect-[4/3] w-full"
            iconClassName="h-20 w-20"
          />
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Availability
              </p>
              <p
                className={`mt-1 text-sm font-medium ${
                  !available
                    ? "text-slate-500"
                    : lowStock
                      ? "text-amber-700"
                      : "text-green-700"
                }`}
              >
                {availability}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Category</p>
                <p className="mt-1 font-medium text-slate-800">
                  {item.category.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total quantity</p>
                <p className="mt-1 font-medium text-slate-800">
                  {item.totalQuantity}
                </p>
              </div>
            </div>
            {user?.role === "ADMIN" && (
              <details className="border-t border-slate-200 pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  Admin item details
                </summary>
                <dl className="mt-3 divide-y divide-slate-200 border border-slate-200">
                  {[
                    ["Item code", item.code],
                    ["Condition", item.condition],
                    ["Status", item.status],
                    ["Department", item.department ?? "-"],
                    ["Available quantity", String(item.availableQuantity)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-4 px-3 py-2 text-xs"
                    >
                      <dt className="font-semibold text-slate-500">{label}</dt>
                      <dd className="text-right text-slate-800">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Borrow Request" />
          <div className="card-body space-y-4">
            {!user && (
              <Link to="/login" className="inline-block">
                <Button>Log in to request</Button>
              </Link>
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
      </div>
    </>
  );
}
