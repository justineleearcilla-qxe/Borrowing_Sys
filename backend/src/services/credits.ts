import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/http";

// Each overdue offense adds 2 penalty points in cron.ts; every penalty point
// costs the borrower 20 credits. Deriving credits from the stored column (vs.
// a second number we'd have to keep in sync) means the score, the blacklist
// and this gate can never disagree.
const CREDITS_PER_PENALTY_POINT = 20;

/** Below this score a borrower cannot create reservations or join waitlists. */
export const SUSPEND_BELOW_CREDITS = 50;

export type CreditTierKey =
  | "full"
  | "good"
  | "probation"
  | "suspended"
  | "blacklisted";

export interface CreditTier {
  key: CreditTierKey;
  min: number;
  max: number;
  label: string;
  tone: "green" | "blue" | "yellow" | "red" | "gray";
  description: string;
  privileges: string[];
}

// Ordered high -> low. `blacklisted` overlaps `suspended` at 0 and is only
// selected via the isBlacklisted flag, never by score alone.
export const CREDIT_TIERS: CreditTier[] = [
  {
    key: "full",
    min: 90,
    max: 100,
    label: "Full Privilege",
    tone: "green",
    description:
      "You have full borrowing privileges. Everything in the catalog is open to you.",
    privileges: [
      "Borrow any equipment with no restrictions",
      "Full quantity limits on every item",
      "Standard waitlist access",
    ],
  },
  {
    key: "good",
    min: 70,
    max: 89,
    label: "Good Standing",
    tone: "blue",
    description:
      "Your account is in good standing. Keep returning items on time to stay here.",
    privileges: [
      "Normal borrowing privileges",
      "Standard quantity limits",
      "No staff review required",
    ],
  },
  {
    key: "probation",
    min: 50,
    max: 69,
    label: "Probation",
    tone: "yellow",
    description:
      "Your record shows late returns. You can still borrow, but with reduced limits.",
    privileges: [
      "Still allowed to borrow",
      "Reduced quantity limits",
      "Flagged to the equipment desk",
    ],
  },
  {
    key: "suspended",
    min: 0,
    max: 49,
    label: "Suspended",
    tone: "red",
    description:
      "Your credits dropped below the borrowing minimum. Return any overdue equipment to recover.",
    privileges: [
      "Cannot create reservations",
      "Cannot join waitlists",
      "Return overdue items to restore access",
    ],
  },
  {
    key: "blacklisted",
    min: 0,
    max: 0,
    label: "Blacklisted",
    tone: "red",
    description:
      "Your account was suspended after repeated late returns. Contact the equipment office.",
    privileges: [
      "Borrowing fully blocked",
      "Contact the equipment desk to appeal",
    ],
  },
];

type BorrowerTrust = Pick<User, "penaltyPoints" | "isBlacklisted">;

export function creditsFrom(user: BorrowerTrust): number {
  if (user.isBlacklisted) return 0;
  return Math.max(0, 100 - user.penaltyPoints * CREDITS_PER_PENALTY_POINT);
}

export function tierFor(credits: number, isBlacklisted: boolean): CreditTier {
  if (isBlacklisted) {
    return CREDIT_TIERS.find((t) => t.key === "blacklisted")!;
  }
  return (
    CREDIT_TIERS.find((t) => t.key !== "blacklisted" && credits >= t.min) ??
    CREDIT_TIERS[CREDIT_TIERS.length - 1]
  );
}

/**
 * Shared gate for every borrowing action. Kept async so callers can `await`
 * it next to their other checks without caring whether stats are involved.
 */
export async function assertBorrowable(user: BorrowerTrust): Promise<void> {
  if (user.isBlacklisted) {
    throw new ApiError(
      403,
      "Your borrowing privileges are suspended due to repeated late returns. Please contact the equipment office.",
    );
  }
  const credits = creditsFrom(user);
  if (credits < SUSPEND_BELOW_CREDITS) {
    throw new ApiError(
      403,
      `Your borrowing credits are ${credits}/100, below the ${SUSPEND_BELOW_CREDITS}-credit minimum needed to borrow. Return any overdue equipment to restore your privileges.`,
    );
  }
}

export async function creditSummary(user: User) {
  const credits = creditsFrom(user);
  const tier = tierFor(credits, user.isBlacklisted);

  const loans = await prisma.loan.findMany({
    where: { userId: user.id },
    select: { status: true, returnDate: true, returnedAt: true },
  });
  const returned = loans.filter((l) => l.status === "RETURNED");
  const lateReturns = returned.filter(
    (l) => l.returnedAt !== null && l.returnedAt > l.returnDate,
  ).length;

  return {
    credits,
    penaltyPoints: user.penaltyPoints,
    isBlacklisted: user.isBlacklisted,
    canBorrow: !user.isBlacklisted && credits >= SUSPEND_BELOW_CREDITS,
    suspendBelow: SUSPEND_BELOW_CREDITS,
    formula: `100 - ${CREDITS_PER_PENALTY_POINT} x ${user.penaltyPoints} penalty point(s) = ${credits}`,
    tier,
    tiers: CREDIT_TIERS,
    stats: {
      totalLoans: loans.length,
      overdueCount: loans.filter((l) => l.status === "OVERDUE").length,
      returnedLoans: returned.length,
      onTimeReturns: returned.length - lateReturns,
      lateReturns,
    },
  };
}
