import { prisma } from '../lib/prisma'
import { sendMail } from './mailer'

const PENALTY_PER_OFFENSE = 2
const BLACKLIST_THRESHOLD = 6
const REMINDER_WINDOW_HOURS = 48

export async function runMaintenanceSweep(): Promise<{ flagged: number; reminded: number }> {
  const now = new Date()

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

  if (dueLoans.length || reminders.length) {
    console.log(`[cron] flagged ${dueLoans.length} overdue, sent ${reminders.length} reminders`)
  }
  return { flagged: dueLoans.length, reminded: reminders.length }
}
