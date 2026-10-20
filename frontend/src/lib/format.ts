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
