import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../../api/client'
import type { Loan, LoanStatus } from '../../types'
import { formatDate, loanStatusTone } from '../../lib/format'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Modal, PageHeader, Spinner, Textarea } from '../../components/ui'

const TABS: Array<{ key: string; label: string }> = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'BORROWED', label: 'Borrowed' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'REJECTED', label: 'Rejected' },
]

export default function AdminRequests() {
  const [status, setStatus] = useState<string>('PENDING')
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rejectLoan, setRejectLoan] = useState<Loan | null>(null)
  const [rejectRemarks, setRejectRemarks] = useState('')

  function load(s: string) {
    setLoading(true)
    api
      .get<Loan[]>('/loans', { params: s === 'ALL' ? {} : { status: s } })
      .then((res) => setLoans(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(status)
  }, [status])

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      await api.get<Loan[]>('/loans', { params: status === 'ALL' ? {} : { status } }).then((res) => setLoans(res.data))
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const approve = (l: Loan) => act(l.id, () => api.patch(`/loans/${l.id}/decide`, { action: 'approve' }))
  async function submitReject() {
    if (!rejectLoan) return
    const loan = rejectLoan
    setRejectLoan(null)
    await act(loan.id, () => api.patch(`/loans/${loan.id}/decide`, { action: 'reject', remarks: rejectRemarks || undefined }))
    setRejectRemarks('')
  }

  return (
    <>
      <PageHeader title="Borrow Requests" description="Review and approve or reject loan requests. Use Check-out / Return for pickups and returns." />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:gap-0 md:border-b md:border-slate-200">
        {[{ key: 'ALL', label: 'All' }, ...TABS].map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={`min-w-0 whitespace-nowrap border px-3 py-2 text-sm font-semibold transition-colors sm:px-4 md:-mb-px md:shrink-0 ${
              status === t.key ? 'border-primary-800 bg-white text-primary-800 md:border-b-white' : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title={`${status === 'ALL' ? 'All' : status} requests`} />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : loans.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No requests in this view" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Requester</th>
                  <th className="th">Item</th>
                  <th className="th">Dates</th>
                  <th className="th">Purpose / Remarks</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loans.map((l) => (
                  <tr key={l.id} className={l.status === 'OVERDUE' ? 'bg-red-50/50' : undefined}>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-800">{l.user?.name}</p>
                        {(l.user?.isBlacklisted ||
                          (l.user?.overdueLoanCount ?? 0) > 0) && (
                          <Badge tone="red">
                            {l.user?.isBlacklisted
                              ? "Blacklisted"
                              : `${l.user?.overdueLoanCount} overdue`}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{l.user?.email}</p>
                      <p className="text-xs text-slate-400">{l.user?.department ?? 'No department'}</p>
                    </td>
                    <td className="td">
                      <p className="font-medium">{l.item.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {l.item.code} - Qty {l.quantity}
                      </p>
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      Needed: {formatDate(l.dateNeeded)}
                      <br />
                      Return: {formatDate(l.returnDate)}
                    </td>
                    <td className="td max-w-[240px] text-xs">
                      <p>{l.purpose}</p>
                      {l.remarks && <p className="mt-1 italic text-slate-400">Remarks: {l.remarks}</p>}
                      {l.outcome && l.outcome !== 'OK' && <Badge tone="red" className="mt-1">Returned {l.outcome}</Badge>}
                    </td>
                    <td className="td">
                      <Badge tone={loanStatusTone[l.status as LoanStatus] as never}>{l.status}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        {l.status === 'PENDING' && (
                          <>
                            <Button variant="success" size="sm" disabled={busyId === l.id} onClick={() => approve(l)}>
                              Approve
                            </Button>
                            <Button variant="danger" size="sm" disabled={busyId === l.id} onClick={() => { setRejectLoan(l); setRejectRemarks('') }}>
                              Reject
                            </Button>
                          </>
                        )}
                        {l.status === 'APPROVED' && (
                          <span className="text-xs text-slate-500">Use Check-out / Return for pickup</span>
                        )}
                        {(l.status === 'BORROWED' || l.status === 'OVERDUE') && (
                          <span className="text-xs text-slate-500">Use Check-out / Return for return</span>
                        )}
                        {['RETURNED', 'REJECTED'].includes(l.status) && <span className="text-xs text-slate-300">No actions</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(rejectLoan)}
        onClose={() => setRejectLoan(null)}
        title={`Reject request #${rejectLoan?.id ?? ''}`}
        showCloseButton={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectLoan(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReject}>
              Confirm rejection
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Rejecting <span className="font-semibold">{rejectLoan?.item.name}</span> requested by{' '}
          <span className="font-semibold">{rejectLoan?.user?.name}</span>.
        </p>
        <Field label="Remarks (optional)">
          <Textarea
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
            placeholder="Reason shown to the requester..."
            maxLength={300}
            className="reject-remarks"
          />
        </Field>
      </Modal>

    </>
  )
}
