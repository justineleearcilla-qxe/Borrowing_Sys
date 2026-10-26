import { useEffect, useState } from 'react'
import { api, apiErrorMessage } from '../../api/client'
import type { Reservation, ReservationStatus } from '../../types'
import { formatClock, formatDate, reservationStatusTone } from '../../lib/format'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../../components/ui'

const TABS: Array<{ key: string; label: string }> = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'COMPLETED', label: 'Picked up' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

function localDateKey(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function AdminReservations() {
  const [status, setStatus] = useState<string>('PENDING')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rejecting, setRejecting] = useState<Reservation | null>(null)
  const [remarks, setRemarks] = useState('')
  const todayKey = localDateKey(new Date())

  function load(s: string, q: string) {
    setLoading(true)
    const params: Record<string, string> = {}
    if (s !== 'ALL') params.status = s
    if (q) params.q = q
    api
      .get<Reservation[]>('/reservations', { params })
      .then((res) => setRows(res.data))
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(status, search)
  }, [status, search])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  async function act(id: number, fn: () => Promise<unknown>) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      load(status, search)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const approve = (r: Reservation) =>
    act(r.id, () => api.patch(`/reservations/${r.id}/decide`, { action: 'approve' }))
  const pickup = (r: Reservation) =>
    act(r.id, () => api.patch(`/reservations/${r.id}/pickup`))

  async function submitReject() {
    if (!rejecting) return
    const id = rejecting.id
    setRejecting(null)
    await act(id, () =>
      api.patch(`/reservations/${id}/decide`, {
        action: 'reject',
        remarks: remarks || undefined,
      }),
    )
    setRemarks('')
  }

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Approve or reject future holds. Pickups due today or earlier are processed at Check-out / Return; early pickup remains available here."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          role="group"
          aria-label="Filter reservations by status"
          className="flex max-w-full gap-1 overflow-x-auto border border-slate-200 bg-slate-100 p-1"
        >
          {[{ key: 'ALL', label: 'All' }, ...TABS].map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={status === t.key}
              onClick={() => setStatus(t.key)}
              className={`shrink-0 whitespace-nowrap border px-3 py-2 text-sm font-semibold transition-colors ${
                status === t.key
                  ? 'border-primary-800 bg-primary-800 text-white shadow-sm'
                  : 'border-transparent bg-transparent text-slate-600 hover:bg-white hover:text-primary-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-full md:max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, item or purpose..."
            aria-label="Search reservations"
            maxLength={100}
          />
        </div>
      </div>

      <Card>
        <CardHeader title={`${status === 'ALL' ? 'All' : status} reservations`} />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No reservations in this view"
              hint={search ? `Nothing matches "${search}".` : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Borrower</th>
                  <th className="th">Item</th>
                  <th className="th">Window</th>
                  <th className="th">Purpose / Remarks</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td">
                      <p className="font-semibold text-slate-800">{r.user?.name}</p>
                      <p className="text-xs text-slate-400">{r.user?.email}</p>
                      <p className="text-xs text-slate-400">{r.user?.department ?? 'No department'}</p>
                    </td>
                    <td className="td">
                      <p className="font-medium">{r.item.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {r.item.code} - Qty {r.quantity}
                      </p>
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      Pickup: {formatDate(r.reservationDate)}
                      {r.pickupTime && <> at {formatClock(r.pickupTime)}</>}
                      <br />
                      Return: {formatDate(r.returnDate)}
                    </td>
                    <td className="td max-w-[240px] text-xs">
                      <p>{r.purpose}</p>
                      {r.remarks && <p className="mt-1 italic text-slate-400">Remarks: {r.remarks}</p>}
                      {r.decidedBy && (
                        <p className="mt-1 text-slate-400">Decided by {r.decidedBy.name}</p>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={reservationStatusTone[r.status as ReservationStatus] as never}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-2">
                        {r.status === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => approve(r)}
                              disabled={busyId === r.id}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setRejecting(r)}
                              disabled={busyId === r.id}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          localDateKey(r.reservationDate) <= todayKey ? (
                            <span className="text-xs text-slate-500">
                              Use Check-out / Return for pickup
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => pickup(r)}
                              disabled={busyId === r.id}
                            >
                              {busyId === r.id ? 'Checking out...' : 'Mark picked up early'}
                            </Button>
                          )
                        )}
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
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject reservation"
        showCloseButton={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReject}>
              Reject reservation
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {rejecting?.user?.name} asked for {rejecting?.item.name} on{' '}
          {formatDate(rejecting?.reservationDate)}.
        </p>
        <Field label="Remarks (optional, sent to the borrower)">
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Unit is booked that week..."
            maxLength={300}
            className="reject-remarks"
          />
        </Field>
      </Modal>
    </>
  )
}
