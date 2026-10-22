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
        description="Approve or reject future holds, then convert approved ones into loans at the desk."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-0 border-b border-slate-200">
          {[{ key: 'ALL', label: 'All' }, ...TABS].map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`-mb-px border px-4 py-2 text-sm font-semibold transition-colors ${
                status === t.key
                  ? 'border-primary-800 border-b-white bg-white text-primary-800'
                  : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(query.trim())
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, item or purpose..."
            aria-label="Search reservations"
            className="w-64"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader title={`${status === 'ALL' ? 'All' : status} reservations`} />
        {loading ? (
          <div className="flex justify-center py-16 text-primary-800">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
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
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => pickup(r)}
                            disabled={busyId === r.id}
                          >
                            {busyId === r.id ? 'Checking out...' : 'Mark picked up'}
                          </Button>
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
          />
        </Field>
      </Modal>
    </>
  )
}
