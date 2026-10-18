import { Router } from "express";
import { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireStaff } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";
import { sanitizeUser } from "../utils/serialize";
import { sendMail } from "../services/mailer";
import { assertBorrowable } from "../services/credits";
import { assertSlotFree } from "../services/hold";
import { releaseSlot } from "../services/waitlist";
import {
  asDateOnly,
  asEnum,
  asInt,
  asTime,
  assertReservationWindow,
  optEnum,
  prettyDate,
  reqStr,
} from "../utils/validate";

const router = Router();

const ALL_STATUSES: ReservationStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "COMPLETED",
];
const DECISIONS = ["approve", "reject"] as const;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
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
    await assertBorrowable(user);

    const b = (req.body ?? {}) as Record<string, unknown>;

    // --- field-level validation (type, format, range) ---
    const itemId = asInt(b.itemId, "Equipment", { min: 1 })!;
    const quantity = asInt(b.quantity, "Quantity", { min: 1, max: 500, required: false }) ?? 1;
    const pickupDate = asDateOnly(b.reservationDate, "Reservation date");
    const pickupTime = asTime(b.pickupTime, "Pickup time");
    const returnDay = asDateOnly(b.returnDate, "Return date");
    const purpose = reqStr(b.purpose, "Purpose", { min: 5, max: 300 });

    // Shared calendar rules (past dates, ordering, sane horizon) + the
    // end-of-day normalization the database stores.
    const returnDate = assertReservationWindow(pickupDate, returnDay);

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

    // The slot is free again - offer it to the next person waiting for it.
    await releaseSlot(existing.itemId);

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

    // A rejection frees the window it was asking for; approval is net-zero
    // (it moves into a holding status), so only reject passes the slot on.
    if (action === "reject") await releaseSlot(reservation.itemId);

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
// Re-exported so existing consumers keep working now that the engine lives
// in services/hold.ts (shared with the waitlist service).
export { nextAvailableDate, measureHold } from "../services/hold";
export type { Hold } from "../services/hold";
