const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function daysUntil(iso: string): number {
  const target = new Date(iso)
  target.setHours(23, 59, 59, 999)
  return Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export function isDueSoon(status: string, returnDate: string): boolean {
  return status === 'BORROWED' && daysUntil(returnDate) <= 2
}

export const loanStatusTone: Record<string, string> = {
  PENDING: 'yellow',
  APPROVED: 'blue',
  REJECTED: 'gray',
  BORROWED: 'blue',
  RETURNED: 'gray',
  OVERDUE: 'red',
}

export const reservationStatusTone: Record<string, string> = {
  PENDING: 'yellow',
  APPROVED: 'blue',
  REJECTED: 'gray',
  CANCELLED: 'gray',
  EXPIRED: 'red',
  COMPLETED: 'green',
}

/** "14:30" -> "2:30pm"; passes anything unparseable straight through. */
export function formatClock(time?: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${suffix}`
}

export const itemStatusTone: Record<string, string> = {
  AVAILABLE: 'green',
  MAINTENANCE: 'yellow',
  RETIRED: 'gray',
}

export const conditionTone: Record<string, string> = {
  NEW: 'blue',
  GOOD: 'green',
  DAMAGED: 'red',
}

export const waitlistStatusTone: Record<string, string> = {
  WAITING: 'yellow',
  OFFERED: 'blue',
  CLAIMED: 'green',
  CANCELLED: 'gray',
  EXPIRED: 'red',
}

/** "47m left" / "13h left" / "3d left" for the 24h offer deadline. */
export function formatTimeLeft(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
}
