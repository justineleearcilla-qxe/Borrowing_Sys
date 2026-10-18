import { RequestStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/http";
import { prettyDate, startOfDay } from "../utils/validate";

/**
 * The shared conflict engine: who is holding what, over which dates.
 *
 * Used by the reservation routes (create / decide / pickup), the waitlist
 * service (does a freed slot actually fit this person's window?) and the
 * claim path (re-check just before the reservation is written).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reservations in these states occupy the equipment for their date range. */
const HOLDING_RESERVATIONS: ReservationStatus[] = ["PENDING", "APPROVED"];
/** Loans in these states occupy the equipment for their date range. */
const HOLDING_LOANS: RequestStatus[] = ["APPROVED", "BORROWED", "OVERDUE"];

/** A single unit's contribution to an occupied date range. */
export interface HoldRecord {
  quantity: number;
  returnDate: Date;
}

export interface Hold {
  records: HoldRecord[];
  units: number;
}

/**
 * How many units are already spoken for over [start, end), split into
 * overlapping reservations, overlapping loans and offered waitlist slots.
 *
 * Overlap test is the standard interval test: aStart < bEnd && aEnd > bStart.
 * We count PENDING reservations too, otherwise two people can hold the same
 * slot while both are still waiting for a decision.
 *
 * An OFFERED waitlist entry holds its wanted window for the 24h claim
 * deadline - that is what makes "your slot is held for you" true. Pass
 * `excludeWaitlistId` when checking the entry's own window (claim), or it
 * would conflict with the offer it is about to convert.
 */
export async function measureHold(
  itemId: number,
  start: Date,
  end: Date,
  excludeReservationId?: number,
  excludeWaitlistId?: number,
): Promise<Hold> {
  const [reservations, loans, offers] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        itemId,
        status: { in: HOLDING_RESERVATIONS },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        reservationDate: { lt: end },
        returnDate: { gt: start },
      },
      select: { quantity: true, returnDate: true },
    }),
    prisma.loan.findMany({
      where: {
        itemId,
        status: { in: HOLDING_LOANS },
        dateNeeded: { lt: end },
        returnDate: { gt: start },
      },
      select: { quantity: true, returnDate: true },
    }),
    prisma.waitlistEntry.findMany({
      where: {
        itemId,
        status: "OFFERED",
        ...(excludeWaitlistId ? { id: { not: excludeWaitlistId } } : {}),
        wantedDate: { lt: end },
        wantedReturn: { gt: start },
      },
      select: { quantity: true, wantedReturn: true },
    }),
  ]);

  const records: HoldRecord[] = [
    ...reservations.map((r) => ({ quantity: r.quantity, returnDate: r.returnDate })),
    ...loans.map((l) => ({ quantity: l.quantity, returnDate: l.returnDate })),
    ...offers.map((o) => ({ quantity: o.quantity, returnDate: o.wantedReturn })),
  ];
  return { records, units: records.reduce((sum, r) => sum + r.quantity, 0) };
}

/**
 * Earliest date on which `needed` units would actually be free again.
 *
 * Walks the overlapping records in return-date order and counts the units
 * coming back, stopping as soon as the shortfall is covered. Returns the
 * day AFTER those units are due back - equipment handed in today can be
 * collected tomorrow.
 */
export function nextAvailableDate(hold: Hold, total: number, needed: number): Date | null {
  const surplus = hold.units + needed - total;
  if (surplus <= 0) return null;
  const sorted = [...hold.records].sort(
    (a, b) => a.returnDate.getTime() - b.returnDate.getTime(),
  );
  if (sorted.length === 0) return null;
  let freed = 0;
  for (const rec of sorted) {
    freed += rec.quantity;
    if (freed >= surplus) return new Date(startOfDay(rec.returnDate).getTime() + DAY_MS);
  }
  return new Date(
    startOfDay(sorted[sorted.length - 1].returnDate).getTime() + DAY_MS,
  );
}

/**
 * Throws 409 when the requested window would over-book the item.
 *
 * `excludeReservationId` is essential on the decide/pickup paths: the
 * reservation being approved is itself in a HOLDING status, so without
 * excluding it, it would always conflict with itself.
 */
export async function assertSlotFree(
  item: { id: number; name: string; totalQuantity: number },
  start: Date,
  end: Date,
  quantity: number,
  excludeReservationId?: number,
  excludeWaitlistId?: number,
): Promise<void> {
  const hold = await measureHold(item.id, start, end, excludeReservationId, excludeWaitlistId);
  if (hold.units + quantity > item.totalQuantity) {
    const next = nextAvailableDate(hold, item.totalQuantity, quantity);
    const hint = next
      ? ` Next available date: ${prettyDate(next)}.`
      : " Please try different dates.";
    throw new ApiError(
      409,
      `${item.name} is already reserved or borrowed for the requested dates.${hint}`,
    );
  }
}
