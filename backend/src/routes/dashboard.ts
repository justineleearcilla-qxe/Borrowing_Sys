import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { asyncHandler } from '../utils/http'
import { sanitizeUser } from '../utils/serialize'

const router = Router()

async function studentDashboard(userId: number) {
  const now = new Date()
  const dueSoonLimit = new Date(now.getTime() + 48 * 3600 * 1000)
  const [activeLoans, overdueCount, totalRequests, dueSoonCount, dueSoon, recent] = await Promise.all([
    prisma.loan.count({ where: { userId, status: { in: ['APPROVED', 'BORROWED', 'OVERDUE'] } } }),
    prisma.loan.count({ where: { userId, status: 'OVERDUE' } }),
    prisma.loan.count({ where: { userId } }),
    prisma.loan.count({
      where: {
        userId,
        status: 'BORROWED',
        returnDate: { gte: now, lte: dueSoonLimit },
      },
    }),
    prisma.loan.findMany({
      where: {
        userId,
        status: 'BORROWED',
        returnDate: { gte: now, lte: dueSoonLimit },
      },
      include: { item: { include: { category: true } } },
      orderBy: { returnDate: 'asc' },
      take: 6,
    }),
    prisma.loan.findMany({
      where: { userId },
      include: { item: { include: { category: true } } },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ])
  return {
    role: 'BORROWER' as const,
    activeLoans,
    overdueCount,
    totalRequests,
    dueSoonCount,
    dueSoon,
    recent,
    penaltyPoints: undefined,
    isBlacklisted: undefined,
  }
}

async function adminDashboard() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  const firstHistoryMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
  )
  const lowStockWhere = {
    status: 'AVAILABLE' as const,
    availableQuantity: { lte: prisma.item.fields.lowStockThreshold },
  }
  const [totalItems, totalUsers, totalCategories, pendingRequests, borrowedCount, overdueCount, pendingQueue, dueLoans, pendingReservations, loans, historyLoans, lowStockCount, lowStock] =
    await Promise.all([
      prisma.item.count(),
      prisma.user.count(),
      prisma.category.count(),
      prisma.loan.count({ where: { status: 'PENDING' } }),
      prisma.loan.count({ where: { status: 'BORROWED' } }),
      prisma.loan.count({ where: { status: 'OVERDUE' } }),
      prisma.loan.findMany({
        where: { status: 'PENDING' },
        include: { user: true, item: { include: { category: true } } },
        orderBy: { createdAt: 'asc' },
        take: 8,
      }),
      prisma.loan.findMany({
        where: {
          status: { in: ['BORROWED', 'OVERDUE'] },
          returnDate: { lt: tomorrow },
        },
        include: { user: true, item: { include: { category: true } } },
        orderBy: { returnDate: 'asc' },
        take: 5,
      }),
      prisma.reservation.findMany({
        where: { status: 'PENDING' },
        include: { user: true, item: { include: { category: true } } },
        orderBy: { createdAt: 'asc' },
        take: 5,
      }),
      prisma.loan.findMany({
        where: { borrowedAt: { not: null } },
        include: { item: { include: { category: true } } },
      }),
      prisma.loan.findMany({
        where: {
          borrowedAt: { gte: firstHistoryMonth, lte: now },
        },
        select: { borrowedAt: true, quantity: true },
      }),
      prisma.item.count({ where: lowStockWhere }),
      prisma.item.findMany({
        where: lowStockWhere,
        include: { category: true },
        orderBy: { availableQuantity: 'asc' },
        take: 5,
      }),
    ])

  const sums = new Map<number, { name: string; units: number; count: number }>()
  for (const loan of loans) {
    const c = loan.item.category
    const entry = sums.get(c.id) ?? { name: c.name, units: 0, count: 0 }
    entry.units += loan.quantity
    entry.count += 1
    sums.set(c.id, entry)
  }
  const categoryBreakdown = [...sums.values()].sort((a, b) => b.units - a.units)

  const monthlyUnits = new Map<string, number>()
  for (let offset = 0; offset < 6; offset += 1) {
    const month = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + offset, 1),
    )
    monthlyUnits.set(
      `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`,
      0,
    )
  }
  for (const loan of historyLoans) {
    if (loan.borrowedAt) {
      const key = `${loan.borrowedAt.getUTCFullYear()}-${String(
        loan.borrowedAt.getUTCMonth() + 1,
      ).padStart(2, '0')}`
      monthlyUnits.set(key, (monthlyUnits.get(key) ?? 0) + loan.quantity)
    }
  }
  const borrowingHistory = [...monthlyUnits].map(([month, units]) => ({
    month,
    units,
  }))

  return {
    role: 'ADMIN' as const,
    totalItems,
    totalUsers,
    totalCategories,
    pendingRequests,
    borrowedCount,
    overdueCount,
    pendingQueue: pendingQueue.map(({ user, ...l }) => ({ ...l, user: sanitizeUser(user) })),
    dueLoans: dueLoans.map(({ user, ...l }) => ({ ...l, user: sanitizeUser(user) })),
    pendingReservations: pendingReservations.map(({ user, ...reservation }) => ({
      ...reservation,
      user: sanitizeUser(user),
    })),
    categoryBreakdown,
    borrowingHistory,
    lowStockCount,
    lowStock,
  }
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'ADMIN') {
      res.json(await adminDashboard())
    } else {
      res.json(await studentDashboard(req.user!.id))
    }
  })
)

export default router
