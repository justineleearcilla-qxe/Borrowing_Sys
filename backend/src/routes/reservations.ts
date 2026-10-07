import { Router } from "express";
import { Prisma, RequestStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireStaff } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { sendMail } from "../services/mailer";
import {
  asDateOnly,
  asEnum,
  asInt,
  asTime,
  endOfDay,
  optEnum,
  prettyDate,
  reqStr,
  startOfDay,
} from "../utils/validate";

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reservations in these states occupy the equipment for their date range. */
const HOLDING_RESERVATIONS: ReservationStatus[] = ["PENDING", "APPROVED"];
/** Loans in these states occupy the equipment for their date range. */
const HOLDING_LOANS: RequestStatus[] = ["APPROVED", "BORROWED", "OVERDUE"];
const ALL_STATUSES: ReservationStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
];
const DECISIONS = ["approve", "reject"] as const;

/** How far ahead a reservation may be placed. */
const MAX_AHEAD_DAYS = 180;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

/** A single unit's contribution to an occupied date range. */
interface HoldRecord {
  quantity: number;
  returnDate: Date;
}

interface Hold {
  records: HoldRecord[];
  units: number;
}

/**
 * How many units are already spoken for over [start, end), split into
 * overlapping reservations and overlapping loans.
 *
 * Overlap test is the standard interval test: aStart < bEnd && aEnd > bStart.
 * We count PENDING reservations too, otherwise two people can hold the same
 * slot while both are still waiting for a decision.
 */
async function measureHold(
  itemId: number,
  start: Date,
  end: Date,
  excludeReservationId?: number,
): Promise<Hold> {
  const [reservations, loans] = await Promise.all([
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
  ]);

  const records: HoldRecord[] = [
    ...reservations.map((r) => ({ quantity: r.quantity, returnDate: r.returnDate })),
    ...loans.map((l) => ({ quantity: l.quantity, returnDate: l.returnDate })),
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
function nextAvailableDate(hold: Hold, total: number, needed: number): Date | null {
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
async function assertSlotFree(
  item: { id: number; name: string; totalQuantity: number },
  start: Date,
  end: Date,
  quantity: number,
  excludeReservationId?: number,
): Promise<void> {
  const hold = await measureHold(item.id, start, end, excludeReservationId);
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

const itemWithCategory = { item: { include: { category: true } } } as const;

// ---------------------------------------------------------------------------
// CREATE - any signed-in, non-blacklisted borrower
// ---------------------------------------------------------------------------
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.isBlacklisted) {
      throw new ApiError(
        403,
        "Your borrowing privileges are suspended due to repeated late returns. Please contact the equipment office.",
      );
    }

    const b = (req.body ?? {}) as Record<string, unknown>;

    // --- field-level validation (type, format, range) ---
    const itemId = asInt(b.itemId, "Equipment", { min: 1 })!;
    const quantity = asInt(b.quantity, "Quantity", { min: 1, max: 500, required: false }) ?? 1;
    const pickupDate = asDateOnly(b.reservationDate, "Reservation date");
    const pickupTime = asTime(b.pickupTime, "Pickup time");
    const returnDay = asDateOnly(b.returnDate, "Return date");
    const purpose = reqStr(b.purpose, "Purpose", { min: 5, max: 300 });

    // --- logical date rules (past dates, ordering, sane horizon) ---
    const today = startOfDay(new Date());
    if (pickupDate.getTime() < today.getTime()) {
      throw new ApiError(400, "Reservation date cannot be in the past");
    }
    const horizon = new Date(today.getTime() + MAX_AHEAD_DAYS * DAY_MS);
    if (pickupDate.getTime() > horizon.getTime()) {
      throw new ApiError(
        400,
        `Reservations can only be made up to ${MAX_AHEAD_DAYS} days in advance`,
      );
    }
    if (returnDay.getTime() <= pickupDate.getTime()) {
      throw new ApiError(400, "Return date must be after the reservation date");
    }
    // Stored at 23:59:59 of the chosen day: "due March 2" must not count as
    // overdue the instant March 2 begins.
    const returnDate = endOfDay(returnDay);

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new ApiError(404, "Equipment not found");
    if (item.status !== "AVAILABLE") {
      throw new ApiError(409, "This item is not available for reservation");
    }
    // NOTE: we deliberately do NOT check availableQuantity here. The whole
    // point of a reservation is to hold a unit that may be out on loan right
    // now (or simply wanted for a future date). We only cap at total stock.
    if (quantity > item.totalQuantity) {
      throw new ApiError(409, `Only ${item.totalQuantity} unit(s) of this item exist`);
    }

    await assertSlotFree(item, pickupDate, returnDate, quantity);

    const created = await prisma.reservation.create({
      data: {
        userId: user.id,
        itemId,
        quantity,
        reservationDate: pickupDate,
        pickupTime,
        returnDate,
        purpose,
      },
      include: itemWithCategory,
    });
    res.status(201).json(created);
  }),
);

// ---------------------------------------------------------------------------
// LIST - the signed-in borrower's own reservations
// ---------------------------------------------------------------------------
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const reservations = await prisma.reservation.findMany({
      where: { userId: req.user!.id },
      include: itemWithCategory,
      orderBy: { createdAt: "desc" },
    });
    res.json(reservations);
  }),
);

// ---------------------------------------------------------------------------
// LIST - admin / faculty, with search + status filter
// ---------------------------------------------------------------------------
router.get(
  "/",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const { q, status, userId } = req.query as Record<string, string | undefined>;

    const where: Prisma.ReservationWhereInput = {};
    const statusFilter = optEnum(status, "Status", ALL_STATUSES);
    if (statusFilter) where.status = statusFilter;

    const uid = asInt(userId, "User id", { min: 1, required: false });
    if (uid) where.userId = uid;

    if (q) {
      // Prisma binds these as query parameters - no string concatenation.
      const needle = reqStr(q, "Search", { min: 1, max: 100 });
      where.OR = [
        { purpose: { contains: needle, mode: "insensitive" } },
        { item: { name: { contains: needle, mode: "insensitive" } } },
        { item: { code: { contains: needle, mode: "insensitive" } } },
        { user: { name: { contains: needle, mode: "insensitive" } } },
        { user: { email: { contains: needle, mode: "insensitive" } } },
      ];
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: { ...itemWithCategory, user: true, decidedBy: true },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      reservations.map(({ user, decidedBy, ...r }) => ({
        ...r,
        user: sanitizeUser(user),
        decidedBy: decidedBy ? sanitizeUser(decidedBy) : null,
      })),
    );
  }),
);

// ---------------------------------------------------------------------------
// CANCEL - borrower withdraws their OWN pending reservation
// ---------------------------------------------------------------------------
router.patch(
  "/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const existing = await prisma.reservation.findUnique({ where: { id } });

    // Ownership + existence are checked together so a stranger cannot probe
    // which reservation ids belong to other people by reading the status code.
    if (!existing || existing.userId !== req.user!.id) {
      throw new ApiError(404, "Reservation not found");
    }
    if (existing.status !== "PENDING") {
      throw new ApiError(409, "Only pending reservations can be cancelled");
    }

    const remarks = existing.remarks
      ? `${existing.remarks} | Cancelled by borrower`
      : "Cancelled by borrower";

    const updated = await prisma.reservation.update({
      where: { id },
      data: { status: "CANCELLED", remarks },
      include: itemWithCategory,
    });
    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// DECIDE - admin / faculty approve or reject (conflict is re-checked on approve)
// ---------------------------------------------------------------------------
router.patch(
  "/:id/decide",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = asEnum(body.action, "Action", DECISIONS);
    const cleanRemarks = body.remarks ? reqStr(body.remarks, "Remarks", { max: 300 }) : null;

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { user: true, item: true },
    });
    if (!reservation) throw new ApiError(404, "Reservation not found");
    if (reservation.status !== "PENDING") {
      throw new ApiError(409, "Only pending reservations can be decided");
    }

    if (action === "approve") {
      // Re-check NOW rather than trusting the check done at submit time -
      // the schedule may have filled up in the meantime.
      const item = await prisma.item.findUnique({ where: { id: reservation.itemId } });
      if (!item) throw new ApiError(404, "Equipment not found");
      if (item.status !== "AVAILABLE") {
        throw new ApiError(
          409,
          "This item is no longer available for reservation (maintenance or retired)",
        );
      }
      await assertSlotFree(
        item,
        reservation.reservationDate,
        reservation.returnDate,
        reservation.quantity,
        reservation.id, // <- never count this reservation against itself
      );
    }

    const status: ReservationStatus = action === "approve" ? "APPROVED" : "REJECTED";
    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        status,
        decidedById: req.user!.id,
        remarks: cleanRemarks ?? reservation.remarks,
      },
      include: { ...itemWithCategory, user: true, decidedBy: true },
    });

    await sendMail(
      reservation.user.email,
      action === "approve"
        ? "Your equipment reservation was approved"
        : "Your equipment reservation was rejected",
      `Dear ${reservation.user.name},\n\nYour reservation for "${reservation.item.name}" x${reservation.quantity} on ${prettyDate(reservation.reservationDate)} has been ${status.toLowerCase()}.${
        cleanRemarks ? `\n\nRemarks from the equipment desk: ${cleanRemarks}` : ""
      }${action === "approve" ? "\n\nPlease collect it from the equipment desk at your reserved time." : ""}\n\nEquipment Desk`,
    );

    const { user, decidedBy, ...rest } = updated;
    res.json({
      ...rest,
      user: sanitizeUser(user),
      decidedBy: decidedBy ? sanitizeUser(decidedBy) : null,
    });
  }),
);

// ---------------------------------------------------------------------------
// PICK UP - one click converts an approved reservation into a real Loan
// ---------------------------------------------------------------------------
router.patch(
  "/:id/pickup",
  requireAuth,
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { user: true, item: true },
    });
    if (!reservation) throw new ApiError(404, "Reservation not found");
    if (reservation.status !== "APPROVED") {
      throw new ApiError(409, "Only approved reservations can be checked out");
    }

    const item = await prisma.item.findUnique({ where: { id: reservation.itemId } });
    if (!item) throw new ApiError(404, "Equipment not found");
    if (item.status !== "AVAILABLE") {
      throw new ApiError(409, "This item cannot be checked out (maintenance or retired)");
    }
    await assertSlotFree(
      item,
      reservation.reservationDate,
      reservation.returnDate,
      reservation.quantity,
      reservation.id,
    );

    const result = await prisma.$transaction(async (tx) => {
      // Guarded decrement: the WHERE clause makes this atomic, so two
      // simultaneous checkouts can never drive availableQuantity negative.
      const decremented = await tx.item.updateMany({
        where: { id: reservation.itemId, availableQuantity: { gte: reservation.quantity } },
        data: { availableQuantity: { decrement: reservation.quantity } },
      });
      if (decremented.count === 0) {
        throw new ApiError(409, "Not enough stock available to check out this reservation");
      }

      const loan = await tx.loan.create({
        data: {
          userId: reservation.userId,
          itemId: reservation.itemId,
          quantity: reservation.quantity,
          purpose: reservation.purpose,
          dateNeeded: reservation.reservationDate,
          returnDate: reservation.returnDate,
          status: "BORROWED",
          remarks: reservation.remarks,
          decidedById: req.user!.id,
          borrowedAt: new Date(),
        },
      });

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "COMPLETED",
          loanId: loan.id,
          pickedUpAt: new Date(),
          decidedById: reservation.decidedById ?? req.user!.id,
        },
        include: itemWithCategory,
      });

      return { loan, reservation: updated };
    });

    await sendMail(
      reservation.user.email,
      "Equipment collected",
      `Dear ${reservation.user.name},\n\n"${reservation.item.name}" x${reservation.quantity} has been issued to you. It is due back on ${prettyDate(reservation.returnDate)}.\n\nEquipment Desk`,
    );

    res.json(result);
  }),
);

export default router;
export { ALL_STATUSES as RESERVATION_STATUSES };
export { nextAvailableDate, measureHold };
export type { Hold };
