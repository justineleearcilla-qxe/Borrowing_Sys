import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import type { CreditsSummary, CreditTier } from "../types";
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
import { Icon } from "../components/Icon";

/** Tailwind classes per tier tone (kept parallel to Badge tones). */
const toneText: Record<CreditTier["tone"], string> = {
  green: "text-emerald-600",
  blue: "text-blue-600",
  yellow: "text-amber-600",
  red: "text-red-600",
  gray: "text-slate-600",
};
const toneFill: Record<CreditTier["tone"], string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};
const toneRing: Record<CreditTier["tone"], string> = {
  green: "border-emerald-500 bg-emerald-50",
  blue: "border-blue-500 bg-blue-50",
  yellow: "border-amber-500 bg-amber-50",
  red: "border-red-500 bg-red-50",
  gray: "border-slate-400 bg-slate-50",
};

function tierRange(t: CreditTier) {
  return t.key === "blacklisted" ? "0 (blacklisted)" : `${t.min}-${t.max}`;
}

export default function Credits() {
  const [summary, setSummary] = useState<CreditsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<CreditsSummary>("/credits/mine")
      .then((res) => setSummary(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="Borrowing Credits"
          description="Your score and the privileges it unlocks."
        />
        <Alert tone="error">{error}</Alert>
      </>
    );
  }

  if (!summary) {
    return (
      <EmptyState
        title="No credit record yet"
        hint="Your score appears after your first borrow request."
      />
    );
  }

  const { credits, tier, tiers, stats, canBorrow } = summary;

  return (
    <>
      <PageHeader
        title="Borrowing Credits"
        description="Your score and the privileges it unlocks."
        actions={
          <Link to="/catalog">
            <Button variant="secondary">
              <Icon name="arrow-left" className="h-4 w-4" />
              Browse equipment
            </Button>
          </Link>
        }
      />

      {!canBorrow && (
        <div className="mb-4">
          <Alert tone="error">
            Borrowing is currently suspended for your account ({credits}/100
            credits, minimum {summary.suspendBelow}). Return any overdue
            equipment to restore your privileges, or contact the equipment
            desk.
          </Alert>
        </div>
      )}

      {/* --- score hero --- */}
      <Card className="mb-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Current credits
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-5xl font-bold tabular-nums ${toneText[tier.tone]}`}
              >
                {credits}
              </span>
              <span className="text-lg font-semibold text-slate-400">/100</span>
              <Badge tone={tier.tone as never} className="ml-2">
                {tier.label}
              </Badge>
            </p>
          </div>
          <div className="min-w-[240px] flex-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${toneFill[tier.tone]}`}
                style={{ width: `${credits}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{summary.formula}</p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-slate-600">
          {tier.description}
        </p>
      </Card>

      {/* --- privileges ladder --- */}
      <Card className="mb-4">
        <CardHeader title="Borrowing privileges" />
        <div className="divide-y divide-slate-200">
          {tiers.map((t) => {
            const current = t.key === tier.key;
            return (
              <div
                key={t.key}
                className={`px-4 py-4 sm:px-5 ${
                  current ? `border-l-4 ${toneRing[t.tone]}` : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-bold ${
                        current ? toneText[t.tone] : "text-slate-700"
                      }`}
                    >
                      {t.label}
                    </span>
                    <Badge tone={t.tone as never}>{tierRange(t)}</Badge>
                  </div>
                  {current && (
                    <Badge tone="purple">You are here ({credits}/100)</Badge>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {t.privileges.map((p) => (
                    <li
                      key={p}
                      className="flex items-start gap-2 text-xs text-slate-600"
                    >
                      <Icon
                        name="check"
                        className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${
                          current ? toneText[t.tone] : "text-slate-300"
                        }`}
                      />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      {/* --- how it is calculated --- */}
      <Card>
        <CardHeader title="How your credits are calculated" />
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-sm text-slate-600">
            You start at <span className="font-semibold">100 credits</span>.
            Every overdue item adds 2 penalty points, and each penalty point
            costs 20 credits. Credits below {summary.suspendBelow} suspend
            borrowing, and reaching 6 penalty points blacklists the account.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Penalty points" value={summary.penaltyPoints} tone={summary.penaltyPoints > 0 ? "amber" : "green"} />
            <StatCard label="Overdue now" value={stats.overdueCount} tone={stats.overdueCount > 0 ? "red" : "green"} />
            <StatCard label="Late returns" value={stats.lateReturns} tone={stats.lateReturns > 0 ? "amber" : "green"} />
            <StatCard label="On-time returns" value={stats.onTimeReturns} tone="green" />
            <StatCard label="Total requests" value={stats.totalLoans} />
          </div>
        </div>
      </Card>
    </>
  );
}
