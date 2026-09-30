import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { asyncHandler } from '../utils/http'
import { sanitizeUser } from '../utils/serialize'

const router = Router()

async function studentDashboard(userId: number) {
  const [activeLoans, overdueCount, totalRequests, dueSoon, recent] = await Promise.all([
    prisma.loan.count({ where: { userId, status: { in: ['APPROVED', 'BORROWED', 'OVERDUE'] } } }),
    prisma.loan.count({ where: { userId, status: 'OVERDUE' } }),
    prisma.loan.count({ where: { userId } }),
    prisma.loan.findMany({
      where: { userId, status: { in: ['BORROWED', 'OVERDUE'] }, returnDate: { lte: new Date(Date.now() + 48 * 3600 * 1000) } },
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
    dueSoon,
    recent,
    penaltyPoints: undefined,
    isBlacklisted: undefined,
  }
}

async function adminDashboard() {
  const [totalItems, totalUsers, totalCategories, pendingRequests, borrowedCount, overdueCount, pendingQueue, loans, lowStock] =
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
        where: { status: { not: 'REJECTED' } },
        include: { item: { include: { category: true } } },
      }),
      prisma.item.findMany({
        where: { status: 'AVAILABLE', availableQuantity: { lte: 1 } },
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

  return {
    role: 'ADMIN' as const,
    totalItems,
    totalUsers,
    totalCategories,
    pendingRequests,
    borrowedCount,
    overdueCount,
    pendingQueue: pendingQueue.map(({ user, ...l }) => ({ ...l, user: sanitizeUser(user) })),
    categoryBreakdown,
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
