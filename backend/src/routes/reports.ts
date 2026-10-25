import { Router } from 'express'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { asyncHandler } from '../utils/http'

const router = Router()

async function buildSummary() {
  const [totalItems, totalUsers, totalCategories, pendingRequests, approvedRequests, borrowedCount, overdueCount, returnedCount, rejectedCount, damagedItems, lostLoans] =
    await Promise.all([
      prisma.item.count(),
      prisma.user.count(),
      prisma.category.count(),
      prisma.loan.count({ where: { status: 'PENDING' } }),
      prisma.loan.count({ where: { status: 'APPROVED' } }),
      prisma.loan.count({ where: { status: 'BORROWED' } }),
      prisma.loan.count({ where: { status: 'OVERDUE' } }),
      prisma.loan.count({ where: { status: 'RETURNED' } }),
      prisma.loan.count({ where: { status: 'REJECTED' } }),
      prisma.item.count({ where: { condition: 'DAMAGED' } }),
      prisma.loan.count({ where: { outcome: 'LOST' } }),
    ])
  return {
    totalItems,
    totalUsers,
    totalCategories,
    pendingRequests,
    approvedRequests,
    borrowedCount,
    overdueCount,
    returnedCount,
    rejectedCount,
    damagedItems,
    lostLoans,
  }
}

async function buildMostBorrowed() {
  const loans = await prisma.loan.findMany({
    where: { borrowedAt: { not: null } },
    include: { item: { include: { category: true } } },
  })
  const sums = new Map<number, { code: string; name: string; category: string; timesBorrowed: number; units: number }>()
  for (const loan of loans) {
    const entry =
      sums.get(loan.itemId) ??
      { code: loan.item.code, name: loan.item.name, category: loan.item.category.name, timesBorrowed: 0, units: 0 }
    entry.timesBorrowed += 1
    entry.units += loan.quantity
    sums.set(loan.itemId, entry)
  }
  return [...sums.values()].sort((a, b) => b.units - a.units || b.timesBorrowed - a.timesBorrowed).slice(0, 15)
}

async function buildByDepartment() {
  const loans = await prisma.loan.findMany({
    where: { status: { not: 'REJECTED' } },
    include: { user: true },
  })
  const sums = new Map<string, { requests: number; units: number }>()
  for (const loan of loans) {
    const dept = loan.user.department?.trim() || 'Unspecified'
    const entry = sums.get(dept) ?? { requests: 0, units: 0 }
    entry.requests += 1
    entry.units += loan.quantity
    sums.set(dept, entry)
  }
  return [...sums.entries()]
    .map(([department, v]) => ({ department, ...v }))
    .sort((a, b) => b.units - a.units)
}

async function buildDamageLoss() {
  const [incidents, damagedItems] = await Promise.all([
    prisma.loan.findMany({
      where: { outcome: { in: ['DAMAGED', 'LOST'] } },
      include: { user: true, item: true },
      orderBy: { returnedAt: 'desc' },
    }),
    prisma.item.findMany({
      where: { condition: 'DAMAGED' },
      include: { category: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return {
    incidents: incidents.map(({ user, item, ...l }) => ({
      ...l,
      itemName: `${item.name} (${item.code})`,
      borrower: user.name,
      borrowerEmail: user.email,
    })),
    damagedItems: damagedItems.map(({ category, ...i }) => ({ ...i, categoryName: category.name })),
  }
}

router.get(
  '/summary',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => res.json(await buildSummary()))
)

router.get(
  '/most-borrowed',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => res.json(await buildMostBorrowed()))
)

router.get(
  '/by-department',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => res.json(await buildByDepartment()))
)

router.get(
  '/damage-loss',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => res.json(await buildDamageLoss()))
)

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
}

router.get(
  '/export/excel',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [summary, mostBorrowed, byDepartment, damageLoss] = await Promise.all([
      buildSummary(),
      buildMostBorrowed(),
      buildByDepartment(),
      buildDamageLoss(),
    ])

    const wb = new ExcelJS.Workbook()
    wb.creator = 'College Equipment Borrowing System'
    wb.created = new Date()

    const summarySheet = wb.addWorksheet('Summary')
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 14 },
    ]
    styleHeaderRow(summarySheet.getRow(1))
    Object.entries(summary).forEach(([metric, value]) => {
      summarySheet.addRow({ metric: metric.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), value })
    })

    const itemsSheet = wb.addWorksheet('Most Borrowed')
    itemsSheet.columns = [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Item', key: 'name', width: 34 },
      { header: 'Category', key: 'category', width: 26 },
      { header: 'Times Borrowed', key: 'timesBorrowed', width: 16 },
      { header: 'Units Borrowed', key: 'units', width: 16 },
    ]
    styleHeaderRow(itemsSheet.getRow(1))
    itemsSheet.addRows(mostBorrowed)

    const deptSheet = wb.addWorksheet('By Department')
    deptSheet.columns = [
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Requests', key: 'requests', width: 12 },
      { header: 'Units Borrowed', key: 'units', width: 16 },
    ]
    styleHeaderRow(deptSheet.getRow(1))
    deptSheet.addRows(byDepartment)

    const incidentSheet = wb.addWorksheet('Damage & Loss')
    incidentSheet.columns = [
      { header: 'Loan ID', key: 'id', width: 10 },
      { header: 'Item', key: 'itemName', width: 34 },
      { header: 'Borrower', key: 'borrower', width: 24 },
      { header: 'Outcome', key: 'outcome', width: 12 },
      { header: 'Returned At', key: 'returnedAt', width: 22 },
    ]
    styleHeaderRow(incidentSheet.getRow(1))
    incidentSheet.addRows(
      damageLoss.incidents.map((i) => ({ ...i, returnedAt: i.returnedAt ? new Date(i.returnedAt).toLocaleString() : '' }))
    )

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="equipment-report-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  })
)

router.get(
  '/export/pdf',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [summary, mostBorrowed, byDepartment, damageLoss] = await Promise.all([
      buildSummary(),
      buildMostBorrowed(),
      buildByDepartment(),
      buildDamageLoss(),
    ])

    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="equipment-report-${new Date().toISOString().slice(0, 10)}.pdf"`)
    doc.pipe(res)

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const heading = (text: string) => {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage()
      doc.moveDown(1)
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a8a').text(text)
      doc.moveDown(0.3)
    }

    const table = (headers: string[], rows: string[][], widths: number[]) => {
      const scale = pageWidth / widths.reduce((a, b) => a + b, 0)
      const w = widths.map((x) => x * scale)
      const drawRow = (cells: string[], bold: boolean) => {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 24) doc.addPage()
        const y = doc.y
        let x = doc.page.margins.left
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111827')
        cells.forEach((cell, i) => {
          doc.text(cell, x, y, { width: w[i], lineBreak: false, ellipsis: true })
          x += w[i]
        })
        doc.y = y + 16
        doc.moveTo(doc.page.margins.left, doc.y - 4)
          .lineTo(doc.page.margins.left + pageWidth, doc.y - 4)
          .strokeColor('#d1d5db')
          .lineWidth(0.5)
          .stroke()
      }
      drawRow(headers, true)
      rows.forEach((r) => drawRow(r, false))
    }

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text('Equipment Borrowing Report')
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Generated on ${new Date().toLocaleString()}`)
    doc.moveTo(doc.page.margins.left, doc.y + 6).lineTo(doc.page.margins.left + pageWidth, doc.y + 6).strokeColor('#1e3a8a').lineWidth(2).stroke()
    doc.y += 14

    heading('Summary')
    table(['Metric', 'Value'], Object.entries(summary).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').trim(), String(v)]), [400, 100])

    heading('Most Borrowed Items')
    table(
      ['Code', 'Item', 'Category', 'Times', 'Units'],
      mostBorrowed.map((m) => [m.code, m.name, m.category, String(m.timesBorrowed), String(m.units)]),
      [70, 220, 160, 50, 50]
    )

    heading('Borrowing Frequency per Department')
    table(
      ['Department', 'Requests', 'Units'],
      byDepartment.map((d) => [d.department, String(d.requests), String(d.units)]),
      [350, 120, 120]
    )

    heading('Damage & Loss Incidents')
    table(
      ['Loan ID', 'Item', 'Borrower', 'Outcome'],
      damageLoss.incidents.map((i) => [`#${i.id}`, i.itemName, i.borrower, i.outcome ?? '']),
      [55, 250, 170, 70]
    )
    if (damageLoss.incidents.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('No damage or loss incidents recorded.')
    }

    doc.end()
  })
)

export default router
