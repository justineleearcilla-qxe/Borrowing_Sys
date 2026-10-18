import { prisma } from '../lib/prisma'
import { sendMail } from './mailer'
import { expireStaleOffers, releaseSlot } from './waitlist'

const PENALTY_PER_OFFENSE = 2
const BLACKLIST_THRESHOLD = 6
const REMINDER_WINDOW_HOURS = 48
// A reservation that is not collected this long after its reserved pickup
// date is released back into the pool.
const RESERVATION_GRACE_DAYS = 1
const DAY_MS = 24 * 60 * 60 * 1000

/** Marks stale reservations EXPIRED. Exported so the API can trigger it too. */
export async function expireStaleReservations(now: Date = new Date()): Promise<number> {
  // Only reservations whose pickup date has already passed can be stale.
  const candidates = await prisma.reservation.findMany({
    where: { status: { in: ['PENDING', 'APPROVED'] }, reservationDate: { lt: now } },
    select: { id: true, reservationDate: true, itemId: true },
  })
  const cutoff = now.getTime() - RESERVATION_GRACE_DAYS * DAY_MS
  const staleRows = candidates.filter((r) => r.reservationDate.getTime() < cutoff)
  if (staleRows.length === 0) return 0
  // updateMany, not N x update: no race, one round trip, no partial expiry.
  await prisma.reservation.updateMany({
    where: { id: { in: staleRows.map((r) => r.id) } },
    data: { status: 'EXPIRED' },
  })
  // Every freed window goes to the next person waiting for that item.
  for (const itemId of new Set(staleRows.map((r) => r.itemId))) {
    await releaseSlot(itemId)
  }
  return staleRows.length
}

export async function runMaintenanceSweep(): Promise<{ flagged: number; reminded: number; expired: number; offersExpired: number }> {
  const now = new Date()

  const expired = await expireStaleReservations(now)
  const offersExpired = await expireStaleOffers(now)

  const dueLoans = await prisma.loan.findMany({
    where: { status: 'BORROWED', returnDate: { lt: now } },
    include: { user: true, item: true },
  })

  for (const loan of dueLoans) {
    await prisma.loan.update({ where: { id: loan.id }, data: { status: 'OVERDUE' } })
    const points = loan.user.penaltyPoints + PENALTY_PER_OFFENSE
    const blacklist = points >= BLACKLIST_THRESHOLD && !loan.user.isBlacklisted
    await prisma.user.update({
      where: { id: loan.userId },
      data: { penaltyPoints: points, ...(blacklist ? { isBlacklisted: true } : {}) },
    })
    await sendMail(
      loan.user.email,
      'Overdue equipment notice',
      `Dear ${loan.user.name},\n\nThe following loan is now OVERDUE:\n\n  Item: ${loan.item.name} (${loan.item.code})\n  Quantity: ${loan.quantity}\n  Due date: ${loan.returnDate.toLocaleString()}\n\nPenalty points: ${points}. Please return the equipment as soon as possible.${
        blacklist ? '\n\nYour borrowing privileges have been suspended due to repeated late returns. Contact the equipment office to restore access.' : ''
      }\n\nEquipment Desk`
    )
  }

  const reminderBefore = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000)
  const reminders = await prisma.loan.findMany({
    where: { status: 'BORROWED', returnDate: { gte: now, lte: reminderBefore }, reminderSentAt: null },
    include: { user: true, item: true },
  })

  for (const loan of reminders) {
    await sendMail(
      loan.user.email,
      'Reminder: equipment due soon',
      `Dear ${loan.user.name},\n\nThis is a friendly reminder that the following equipment is due back within ${REMINDER_WINDOW_HOURS} hours:\n\n  Item: ${loan.item.name} (${loan.item.code})\n  Quantity: ${loan.quantity}\n  Due date: ${loan.returnDate.toLocaleString()}\n\nPlease return it on time to avoid penalty points.\n\nEquipment Desk`
    )
    await prisma.loan.update({ where: { id: loan.id }, data: { reminderSentAt: new Date() } })
  }

  if (dueLoans.length || reminders.length || expired || offersExpired) {
    console.log(
      `[cron] flagged ${dueLoans.length} overdue, sent ${reminders.length} reminders, expired ${expired} reservations, expired ${offersExpired} waitlist offers`,
    )
  }
  return { flagged: dueLoans.length, reminded: reminders.length, expired, offersExpired }
}
