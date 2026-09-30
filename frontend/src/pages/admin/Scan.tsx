import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { api, apiErrorMessage } from '../../api/client'
import type { Loan, ScanResult } from '../../types'
import { formatDate, loanStatusTone } from '../../lib/format'
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../../components/ui'
import { Icon } from '../../components/Icon'

export default function AdminScan() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [returnLoan, setReturnLoan] = useState<Loan | null>(null)
  const [returnOutcome, setReturnOutcome] = useState('OK')
  const [returnNote, setReturnNote] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)

  async function resolve(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    setError('')
    setInfo('')
    setResult(null)
    try {
      const res = await api.get<ScanResult>(`/items/code/${encodeURIComponent(trimmed)}`)
      setResult(res.data)
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  async function act(id: number, fn: () => Promise<unknown>, message: string) {
    setBusyId(id)
    setError('')
    try {
      await fn()
      setInfo(message)
      if (code.trim()) await resolve(code)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  const approve = (l: Loan) => act(l.id, () => api.patch(`/loans/${l.id}/decide`, { action: 'approve' }), `Request #${l.id} approved.`)
  const checkout = (l: Loan) => act(l.id, () => api.patch(`/loans/${l.id}/checkout`), `${l.item.name} checked out to ${l.user?.name}.`)
  const quickReturn = (l: Loan) => act(l.id, () => api.patch(`/loans/${l.id}/return`, { outcome: 'OK' }), `${l.item.name} returned by ${l.user?.name}.`)

  async function submitReturn() {
    if (!returnLoan) return
    const loan = returnLoan
    setReturnLoan(null)
    await act(loan.id, () => api.patch(`/loans/${loan.id}/return`, { outcome: returnOutcome, note: returnNote || undefined }), `${loan.item.name} returned (${returnOutcome}).`)
    setReturnNote('')
    setReturnOutcome('OK')
  }

  useEffect(() => {
    if (!scanning) return
    handledRef.current = false
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (text) => {
          if (handledRef.current) return
          handledRef.current = true
          void scanner
            .stop()
            .then(() => {
              setScanning(false)
              setCode(text)
              return resolve(text)
            })
            .catch(() => setScanning(false))
        },
        (cameraErrorMessage) => {
          if (/permission|notallowed|not allowed/i.test(cameraErrorMessage)) {
            setError('Camera permission denied. Use manual code entry instead.')
            setScanning(false)
          }
        }
      )
      .catch((e) => {
        setError(`Camera unavailable: ${e instanceof Error ? e.message : String(e)}. Use manual code entry instead.`)
        setScanning(false)
      })
    return () => {
      const s = scannerRef.current
      scannerRef.current = null
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => undefined)
      }
    }
  }, [scanning])

  return (
    <>
      <PageHeader title="Scan / Quick Check-out" description="Scan an item QR code or type its code to check items out and in." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Resolve item" />
          <div className="card-body space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            {info && <Alert tone="success">{info}</Alert>}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void resolve(code)
              }}
            >
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Item code, e.g. EQ-0001" className="font-mono" />
              <Button type="submit">Resolve</Button>
            </form>

            {!scanning ? (
              <Button variant="secondary" className="w-full" onClick={() => setScanning(true)}>
                <Icon name="camera" className="h-4 w-4" />
                Start camera scanner
              </Button>
            ) : (
              <div className="space-y-2">
                <div id="qr-reader" className="mx-auto w-full max-w-sm overflow-hidden border border-slate-300 bg-black" />
                <Button variant="secondary" className="w-full" onClick={() => setScanning(false)}>
                  Stop camera
                </Button>
              </div>
            )}
            <p className="text-xs text-slate-400">
              Camera scanning requires HTTPS or localhost. Manual code entry always works. Item codes are printed on each item's QR label.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Open loans for this item" />
          <div className="card-body">
            {!result ? (
              <EmptyState title="No item resolved" hint="Scan or enter an item code to see its open loans." />
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-200 p-3">
                  <p className="text-sm font-bold text-slate-800">{result.item.name}</p>
                  <p className="font-mono text-[11px] text-slate-400">{result.item.code}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <Badge tone={result.item.status === 'AVAILABLE' ? 'green' : 'yellow'}>{result.item.status}</Badge>
                    <span>
                      {result.item.availableQuantity} of {result.item.totalQuantity} available
                    </span>
                  </div>
                </div>

                {result.openLoans.length === 0 ? (
                  <EmptyState title="No open loans" hint="All requests for this item are closed." />
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200">
                    {result.openLoans.map((l) => (
                      <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">
                            #{l.id} - {l.user?.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Qty {l.quantity} - Return by {formatDate(l.returnDate)}
                          </p>
                          <Badge tone={loanStatusTone[l.status] as never} className="mt-1">
                            {l.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {l.status === 'PENDING' && (
                            <>
                              <Button variant="success" size="sm" disabled={busyId === l.id} onClick={() => approve(l)}>
                                Approve
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => window.alert('Reject this request from the Requests page to add remarks.')}>
                                Reject
                              </Button>
                            </>
                          )}
                          {l.status === 'APPROVED' && (
                            <Button size="sm" disabled={busyId === l.id} onClick={() => checkout(l)}>
                              Check out
                            </Button>
                          )}
                          {(l.status === 'BORROWED' || l.status === 'OVERDUE') && (
                            <>
                              <Button variant="success" size="sm" disabled={busyId === l.id} onClick={() => quickReturn(l)}>
                                Check in
                              </Button>
                              <Button variant="secondary" size="sm" disabled={busyId === l.id} onClick={() => { setReturnLoan(l); setReturnOutcome('OK'); setReturnNote('') }}>
                                With damage/loss...
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={Boolean(returnLoan)}
        onClose={() => setReturnLoan(null)}
        title={`Process return #${returnLoan?.id ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnLoan(null)}>
              Cancel
            </Button>
            <Button variant="success" onClick={submitReturn}>
              Confirm return
            </Button>
          </>
        }
      >
        <Field label="Item condition on return">
          <Select value={returnOutcome} onChange={(e) => setReturnOutcome(e.target.value)}>
            <option value="OK">OK - no issues</option>
            <option value="DAMAGED">Damaged</option>
            <option value="LOST">Lost (remove from inventory)</option>
          </Select>
        </Field>
        <Field label="Note (optional)">
          <Textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Details about damage or loss..." />
        </Field>
      </Modal>
    </>
  )
}
