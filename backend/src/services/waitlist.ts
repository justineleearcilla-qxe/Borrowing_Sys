import { NotificationType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { measureHold } from "./hold";
import { sendMail } from "./mailer";
import { endOfDay, prettyDate, startOfDay } from "../utils/validate";

/** How long a freed slot is held for the next person in line. */
export const OFFER_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

type NotifyTarget = { id: number; name: string; email: string };

/**
 * In-app notification row + email. The row is written first (that is what
 * the bell reads); sendMail already swallows SMTP failures and falls back to
 * a console log, so neither half can take down the request that triggered it.
 */
export async function notify(
  user: NotifyTarget,
  type: NotificationType,
  title: string,
  body: string,
  link: string | null,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId: user.id, type, title, body, link },
    });
  } catch (e) {
    console.error("[waitlist] notification insert failed", e);
  }
  await sendMail(user.email, title, body);
}

/**
 * A capacity-freeing event happened on this item: offer the slot to the
 * next person in line. Never throws - release hooks fire after the caller's
 * own writes are already committed, so a waitlist hiccup must not fail a
 * cancel/reject/return that already succeeded.
 */
export async function releaseSlot(itemId: number): Promise<void> {
  try {
    await processWaitlistForItem(itemId);
  } catch (e) {
    console.error("[waitlist] processing queue failed", e);
  }
}

/**
 * Walk the FIFO queue for one item and offer every window that now fits.
 *
 * FIFO decision: entries are tested in join order and the first one whose
 * dates are conflict-free gets the offer (later fitting entries may also be
 * offered if their windows do not overlap the first - each offer only holds
 * a window where capacity genuinely exists).
 *
 * Offers are claimed atomically via a WAITING -> OFFERED guarded update, so
 * two concurrent release events can never hand the same entry to two people.
 */
export async function processWaitlistForItem(itemId: number): Promise<void> {
  const now = new Date();
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || item.status !== "AVAILABLE") return;

  // A window whose pickup day has passed can never be claimed.
  await prisma.waitlistEntry.updateMany({
    where: { itemId, status: "WAITING", wantedDate: { lt: startOfDay(now) } },
    data: { status: "EXPIRED" },
  });

  const queue = await prisma.waitlistEntry.findMany({
    where: { itemId, status: "WAITING" },
    include: { user: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const entry of queue) {
    const hold = await measureHold(itemId, entry.wantedDate, endOfDay(entry.wantedReturn));
    if (hold.units + entry.quantity > item.totalQuantity) continue;

    const offerUntil = new Date(now.getTime() + OFFER_HOURS * HOUR_MS);
    const taken = await prisma.waitlistEntry.updateMany({
      where: { id: entry.id, status: "WAITING" },
      data: { status: "OFFERED", offeredAt: now, offerExpiresAt: offerUntil },
    });
    if (taken.count !== 1) continue; // another release event got there first

    await notify(
      entry.user,
      "WAITLIST_OFFER",
      `A slot opened up for ${item.name}`,
      `Dear ${entry.user.name},\n\nA reservation window opened up for "${item.name}" (${item.code}) from ${prettyDate(entry.wantedDate)} to ${prettyDate(entry.wantedReturn)} x${entry.quantity}.\n\nThe slot is held for you for the next ${OFFER_HOURS} hours - claim it from My Reservations before ${prettyDate(offerUntil)} (${offerUntil.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}) or it passes to the next person in line.\n\nEquipment Desk`,
      "/my-reservations",
    );
  }
}

/**
 * Sweep: offers past their 24h deadline become EXPIRED (with a heads-up to
 * the borrower) and each freed slot is re-queued down the line. Also expires
 * stale WAITING entries whose pickup day already passed.
 *
 * Returns how many offers expired so the maintenance endpoint can report it.
 */
export async function expireStaleOffers(now: Date = new Date()): Promise<number> {
  await prisma.waitlistEntry.updateMany({
    where: { status: "WAITING", wantedDate: { lt: startOfDay(now) } },
    data: { status: "EXPIRED" },
  });

  const stale = await prisma.waitlistEntry.findMany({
    where: { status: "OFFERED", offerExpiresAt: { lt: now } },
    select: { id: true, itemId: true, userId: true },
  });
  if (stale.length === 0) return 0;

  for (const entry of stale) {
    const expired = await prisma.waitlistEntry.updateMany({
      where: { id: entry.id, status: "OFFERED" },
      data: { status: "EXPIRED" },
    });
    if (expired.count !== 1) continue; // claimed in the same instant - keep it

    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user) continue;
    await notify(
      user,
      "WAITLIST_MISSED",
      "A waitlist offer expired",
      `Dear ${user.name},\n\nYour ${OFFER_HOURS}-hour hold on a waitlist slot lapsed without being claimed, so the slot has moved to the next person in line.\n\nYou can rejoin the queue from the item's page if you still need it.\n\nEquipment Desk`,
      "/my-reservations",
    );
  }

  const itemIds = [...new Set(stale.map((s) => s.itemId))];
  for (const itemId of itemIds) await releaseSlot(itemId);
  return stale.length;
}
