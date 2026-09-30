import { useEffect, useState } from 'react'
import { api, apiErrorMessage, downloadFile } from '../../api/client'
import type { Item, Loan } from '../../types'
import { formatDate } from '../../lib/format'
import { Alert, Button, Card, CardHeader, EmptyState, PageHeader, Spinner, StatCard } from '../../components/ui'

interface Summary {
  totalItems: number
  totalUsers: number
  totalCategories: number
  pendingRequests: number
  approvedRequests: number
  borrowedCount: number
  overdueCount: number
  returnedCount: number
  rejectedCount: number
  damagedItems: number
  lostLoans: number
}

interface MostBorrowedRow {
  code: string
  name: string
  category: string
  timesBorrowed: number
  units: number
}

interface DepartmentRow {
  department: string
  requests: number
  units: number
}

interface DamageLoss {
  incidents: Array<Loan & { itemName: string; borrower: string; borrowerEmail: string }>
  damagedItems: Array<Item & { categoryName: string }>
}

export default function AdminReports() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [mostBorrowed, setMostBorrowed] = useState<MostBorrowedRow[]>([])
  const [byDepartment, setByDepartment] = useState<DepartmentRow[]>([])
  const [damageLoss, setDamageLoss] = useState<DamageLoss | null>(null)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<Summary>('/reports/summary'),
      api.get<MostBorrowedRow[]>('/reports/most-borrowed'),
      api.get<DepartmentRow[]>('/reports/by-department'),
      api.get<DamageLoss>('/reports/damage-loss'),
    ])
      .then(([s, m, d, dl]) => {
        if (cancelled) return
        setSummary(s.data)
        setMostBorrowed(m.data)
        setByDepartment(d.data)
        setDamageLoss(dl.data)
      })
      .catch((e) => !cancelled && setError(apiErrorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [])

  async function exportReport(kind: 'excel' | 'pdf') {
    setExporting(kind)
    setError('')
    try {
      if (kind === 'excel') await downloadFile('/reports/export/excel', `equipment-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
      else await downloadFile('/reports/export/pdf', `equipment-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setExporting('')
    }
  }

  if (error && !summary) return <Alert tone="error">{error}</Alert>
  if (!summary)
    return (
      <div className="flex justify-center py-20 text-primary-800">
        <Spinner className="h-8 w-8" />
      </div>
    )

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Borrowing trends, department activity and damage/loss tracking."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportReport('excel')} disabled={Boolean(exporting)}>
              {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
            </Button>
            <Button onClick={() => exportReport('pdf')} disabled={Boolean(exporting)}>
              {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Items" value={summary.totalItems} hint={`${summary.totalCategories} categories`} />
        <StatCard label="Users" value={summary.totalUsers} />
        <StatCard label="Borrowed" value={summary.borrowedCount} />
        <StatCard label="Overdue" value={summary.overdueCount} tone={summary.overdueCount > 0 ? 'red' : 'default'} />
        <StatCard label="Damaged items" value={summary.damagedItems} tone={summary.damagedItems > 0 ? 'amber' : 'default'} />
        <StatCard label="Lost units" value={summary.lostLoans} tone={summary.lostLoans > 0 ? 'amber' : 'default'} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Most Borrowed Items" />
          {mostBorrowed.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No borrow data yet" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Code</th>
                    <th className="th">Item</th>
                    <th className="th">Category</th>
                    <th className="th">Times Borrowed</th>
                    <th className="th">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mostBorrowed.map((r, idx) => (
                    <tr key={r.code}>
                      <td className="td tabular-nums text-slate-400">{idx + 1}</td>
                      <td className="td font-mono text-xs">{r.code}</td>
                      <td className="td font-medium">{r.name}</td>
                      <td className="td text-xs">{r.category}</td>
                      <td className="td tabular-nums">{r.timesBorrowed}</td>
                      <td className="td tabular-nums">{r.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Borrowing Frequency per Department" />
          {byDepartment.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No borrow data yet" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="th">Department</th>
                    <th className="th">Requests</th>
                    <th className="th">Units Borrowed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byDepartment.map((d) => (
                    <tr key={d.department}>
                      <td className="td font-medium">{d.department}</td>
                      <td className="td tabular-nums">{d.requests}</td>
                      <td className="td tabular-nums">{d.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Damage & Loss Incidents" />
          {!damageLoss || (damageLoss.incidents.length === 0 && damageLoss.damagedItems.length === 0) ? (
            <div className="p-5">
              <EmptyState title="No damage or loss recorded" hint="Mark returns as damaged or lost to track incidents here." />
            </div>
          ) : (
            <div className="card-body space-y-6">
              {damageLoss.incidents.length > 0 && (
                <div className="overflow-x-auto">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Incidents</p>
                  <table className="w-full min-w-[640px]">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="th">Loan</th>
                        <th className="th">Item</th>
                        <th className="th">Borrower</th>
                        <th className="th">Outcome</th>
                        <th className="th">Returned At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {damageLoss.incidents.map((i) => (
                        <tr key={i.id}>
                          <td className="td">#{i.id}</td>
                          <td className="td">{i.itemName}</td>
                          <td className="td text-xs">
                            {i.borrower}
                            <br />
                            <span className="text-slate-400">{i.borrowerEmail}</span>
                          </td>
                          <td className="td">
                            <span className={`badge ${i.outcome === 'LOST' ? 'badge-red' : 'badge-yellow'}`}>{i.outcome}</span>
                          </td>
                          <td className="td whitespace-nowrap text-xs">{formatDate(i.returnedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {damageLoss.damagedItems.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Items currently flagged as damaged</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-slate-600">
                    {damageLoss.damagedItems.map((i) => (
                      <li key={i.id}>
                        {i.name} ({i.code}) - {i.categoryName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
