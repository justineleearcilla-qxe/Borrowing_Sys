import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { Item } from "../types";
import { conditionTone, itemStatusTone, toDateInput } from "../lib/format";
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

  const specs: Array<[string, string]> = [
    ["Item code", item.code],
    ["Category", item.category.name],
    ["Department", item.department ?? "-"],
    ["Total quantity", String(item.totalQuantity)],
    ["Available", String(item.availableQuantity)],
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
      </div>
    </>
  );
}
