import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ApiError, asyncHandler } from "../utils/http";
import { measureHold } from "../services/hold";
import { OFFER_HOURS, notify, releaseSlot } from "../services/waitlist";
import {
  asDateOnly,
  asInt,
  asTime,
  assertReservationWindow,
  endOfDay,
  prettyDate,
  reqStr,
} from "../utils/validate";

const router = Router();

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Invalid id");
  return id;
}

// ---------------------------------------------------------------------------
// JOIN - queue up for a window that is currently taken
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
    const itemId = asInt(b.itemId, "Equipment", { min: 1 })!;
    const quantity = asInt(b.quantity, "Quantity", { min: 1, max: 500, required: false }) ?? 1;
    const wantedDate = asDateOnly(b.wantedDate, "Wanted pickup date");
    const pickupTime = asTime(b.pickupTime, "Pickup time");
    const wantedReturnDay = asDateOnly(b.wantedReturn, "Wanted return date");
    const purpose = reqStr(b.purpose, "Purpose", { min: 5, max: 300 });
    const returnDate = assertReservationWindow(wantedDate, wantedReturnDay);

    const item = await prisma.item.findUnique({ where: { id: itemId } });
    if (!item) throw new ApiError(404, "Equipment not found");
    if (item.status !== "AVAILABLE") {
      throw new ApiError(409, "This item is not available for reservation");
    }
    if (quantity > item.totalQuantity) {
      throw new ApiError(409, `Only ${item.totalQuantity} unit(s) of this item exist`);
    }

    const already = await prisma.waitlistEntry.findFirst({
      where: { itemId, userId: user.id, status: { in: ["WAITING", "OFFERED"] } },
    });
    if (already) throw new ApiError(409, "You are already on the waitlist for this item.");

    // If the window is free right now there is nothing to wait for.
    const hold = await measureHold(itemId, wantedDate, returnDate);
    if (hold.units + quantity <= item.totalQuantity) {
      throw new ApiError(
        409,
        `${item.name} is available for those dates - you can reserve it directly.`,
      );
    }

    const created = await prisma.waitlistEntry.create({
      data: {
        userId: user.id,
        itemId,
        quantity,
        wantedDate,
        pickupTime,
        wantedReturn: returnDate,
        purpose,
      },
    });
    const ahead = await prisma.waitlistEntry.count({
      where: { itemId, status: "WAITING", createdAt: { lt: created.createdAt } },
    });
    res.status(201).json({ ...created, position: ahead + 1 });
  }),
);

// ---------------------------------------------------------------------------
// LIST - the signed-in borrower's own queue spots, with live FIFO position
// ---------------------------------------------------------------------------
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = await prisma.waitlistEntry.findMany({
      where: { userId: req.user!.id },
      include: { item: { include: { category: true } } },
      orderBy: { createdAt: "desc" },
    });

    const waitingItemIds = [
      ...new Set(entries.filter((e) => e.status === "WAITING").map((e) => e.itemId)),
    ];
    const rank = new Map<number, number>();
    if (waitingItemIds.length > 0) {
      const peers = await prisma.waitlistEntry.findMany({
        where: { itemId: { in: waitingItemIds }, status: "WAITING" },
        select: { id: true, itemId: true, createdAt: true },
      });
      const byItem = new Map<number, typeof peers>();
      for (const p of peers) {
        const list = byItem.get(p.itemId) ?? [];
        list.push(p);
        byItem.set(p.itemId, list);
      }
      for (const list of byItem.values()) {
        list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
        for (let i = 0; i < list.length; i++) rank.set(list[i].id, i + 1);
      }
    }

    res.json(
      entries.map((e) => ({
        ...e,
        position: e.status === "WAITING" ? (rank.get(e.id) ?? null) : null,
      })),
    );
  }),
);

// ---------------------------------------------------------------------------
// LEAVE - the borrower steps out of the queue (frees an offer they held)
// ---------------------------------------------------------------------------
router.patch(
  "/:id/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const entry = await prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== req.user!.id) {
      throw new ApiError(404, "Waitlist entry not found");
    }
    if (entry.status !== "WAITING" && entry.status !== "OFFERED") {
      throw new ApiError(409, "This waitlist spot can no longer be left");
    }

    const wasOffered = entry.status === "OFFERED";
    const updated = await prisma.waitlistEntry.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    // They were holding a slot - pass it straight down the line.
    if (wasOffered) await releaseSlot(entry.itemId);

    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// CLAIM - convert an unexpired offer into a PENDING reservation
// ---------------------------------------------------------------------------
router.post(
  "/:id/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.isBlacklisted) {
      throw new ApiError(
        403,
        "Your borrowing privileges are suspended due to repeated late returns. Please contact the equipment office.",
      );
    }

    const id = parseId(req.params.id);
    const entry = await prisma.waitlistEntry.findUnique({
      where: { id },
      include: { user: true, item: true },
    });
    if (!entry || entry.userId !== user.id) {
      throw new ApiError(404, "Waitlist entry not found");
    }
    if (entry.status === "WAITING") {
      throw new ApiError(409, "You are still in line - this slot has not been offered to you yet");
    }
    if (entry.status !== "OFFERED") {
      throw new ApiError(409, "This waitlist spot can no longer be claimed");
    }
    if (entry.item.status !== "AVAILABLE") {
      throw new ApiError(409, "This item is no longer available for reservation");
    }

    const returnDate = endOfDay(entry.wantedReturn);
    const reservation = await prisma.$transaction(async (tx) => {
      // Only an unexpired OFFERED entry can be claimed; the guarded update
      // makes a double-click or a concurrent sweep a clean 409 instead of a
      // second reservation.
      const taken = await tx.waitlistEntry.updateMany({
        where: { id: entry.id, status: "OFFERED", offerExpiresAt: { gt: new Date() } },
        data: { status: "CLAIMED" },
      });
      if (taken.count !== 1) throw new ApiError(409, "This offer has expired");

      // Re-check the window with their OWN offer excluded - everyone else's
      // hold on those dates still counts. Throwing here rolls the claim back.
      const hold = await measureHold(
        entry.itemId,
        entry.wantedDate,
        returnDate,
        undefined,
        entry.id,
      );
      if (hold.units + entry.quantity > entry.item.totalQuantity) {
        throw new ApiError(
          409,
          `${entry.item.name} is no longer free for those dates - the slot passed to someone else.`,
        );
      }

      const created = await tx.reservation.create({
        data: {
          userId: entry.userId,
          itemId: entry.itemId,
          quantity: entry.quantity,
          reservationDate: entry.wantedDate,
          pickupTime: entry.pickupTime,
          returnDate,
          purpose: entry.purpose,
        },
      });
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { reservationId: created.id },
      });
      return created;
    });

    await notify(
      entry.user,
      "WAITLIST_CLAIMED",
      "Waitlist spot claimed",
      `Dear ${entry.user.name},\n\nYour waitlist spot for "${entry.item.name}" has been claimed - a reservation for ${prettyDate(entry.wantedDate)} to ${prettyDate(entry.wantedReturn)} is now waiting for a decision by the equipment desk. Track it under My Reservations.\n\nEquipment Desk`,
      "/my-reservations",
    );

    res.status(201).json(reservation);
  }),
);

export default router;
