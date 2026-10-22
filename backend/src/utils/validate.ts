import { ApiError } from './http'

/**
 * Server-side input validation helpers.
 *
 * Every route that reads user input should funnel through these instead of
 * doing `Number(x)` / `String(x)` / `x as SomeEnum` inline, because:
 *
 *  - `Number('abc')` is `NaN`, which reaches Prisma as a malformed value and
 *    surfaces as a bare HTTP 500 instead of a helpful 400.
 *  - `x as RequestStatus` is a compile-time cast only. At runtime a bogus
 *    enum string reaches Postgres and blows up the query.
 *  - Unbounded strings let a client store megabytes in a TEXT column.
 *
 * All functions trim, then validate type + format + range, and throw an
 * ApiError (=> friendly 400) on failure. Nothing here ever echoes the raw
 * database error back to the caller.
 */

/** Trim any scalar to a clean string. Never returns `undefined`/`null`. */
export function asText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Required string with length bounds (bounds applied AFTER trimming). */
export function reqStr(
  v: unknown,
  field: string,
  opts: { min?: number; max: number } = { max: 200 },
): string {
  const s = asText(v)
  const min = opts.min ?? 1
  if (s.length < min) {
    throw new ApiError(
      400,
      min === 1 ? `${field} is required` : `${field} must be at least ${min} characters`,
    )
  }
  if (s.length > opts.max) {
    throw new ApiError(400, `${field} must be ${opts.max} characters or fewer`)
  }
  return s
}

/** Optional string: empty/missing becomes `null`, otherwise bounded. */
export function optStr(v: unknown, field: string, max: number): string | null {
  const s = asText(v)
  if (s === '') return null
  if (s.length > max) throw new ApiError(400, `${field} must be ${max} characters or fewer`)
  return s
}

/**
 * Integer validated by range. Accepts numbers or numeric strings (HTML form
 * values arrive as strings). Rejects floats, NaN, Infinity and sign tricks.
 */
export function asInt(
  v: unknown,
  field: string,
  opts: { min?: number; max?: number; required?: boolean } = {},
): number | null {
  const min = opts.min ?? 0
  const max = opts.max ?? Number.MAX_SAFE_INTEGER
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
    if (opts.required === false) return null
    throw new ApiError(400, `${field} is required`)
  }
  const n = typeof v === 'number' ? v : Number(asText(v))
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ApiError(400, `${field} must be a whole number`)
  }
  if (n < min || n > max) {
    throw new ApiError(400, `${field} must be between ${min} and ${max}`)
  }
  return n
}

/**
 * Parse a `YYYY-MM-DD` date (what `<input type="date">` produces) into a Date
 * anchored at LOCAL midnight.
 *
 * Deliberately avoids `new Date('2026-03-01')`, which JavaScript parses as
 * UTC midnight and therefore renders as the previous day in any timezone
 * west of Greenwich - the classic reservation off-by-one.
 */
export function asDateOnly(v: unknown, field: string): Date {
  const s = asText(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new ApiError(400, `${field} must be a valid date (YYYY-MM-DD)`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  // Rejects 2026-02-30, 2026-13-01, 2026-00-10 etc.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    throw new ApiError(400, `${field} is not a real calendar date`)
  }
  return date
}

/**
 * Parse a date string exactly the way the app already does - `new Date(s)` -
 * but validate it first.
 *
 * Kept deliberately separate from `asDateOnly` so that existing routes keep
 * their current interpretation of a valid date (no timezone or overdue-timing
 * behaviour change) while still gaining:
 *   - rejection of unparseable strings (previously an explicit isNaN check)
 *   - rejection of dates that JavaScript would silently roll over, such as
 *     "2026-02-30" which becomes March 2 with no warning.
 */
export function asAnyDate(v: unknown, field: string): Date {
  const s = typeof v === 'string' ? v.trim() : ''
  if (s === '') throw new ApiError(400, `${field} is required`)
  const parsed = new Date(s)
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${field} must be a valid date`)
  }
  // Only enforce the calendar check for the YYYY-MM-DD shape the forms send;
  // a full ISO timestamp with a time zone is already unambiguous.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const probe = new Date(y, mo - 1, d)
    if (probe.getFullYear() !== y || probe.getMonth() !== mo - 1 || probe.getDate() !== d) {
      throw new ApiError(400, `${field} is not a real calendar date`)
    }
  }
  return parsed
}

/** Optional `HH:MM` 24h clock value; empty becomes `null`. */
export function asTime(v: unknown, field: string): string | null {
  const s = asText(v)
  if (s === '') return null
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(s)) {
    throw new ApiError(400, `${field} must be a valid 24-hour time (HH:MM)`)
  }
  return s
}

/**
 * Whitelist an enum. The value must already be a member of `allowed`;
 * anything else (including array/object injection attempts) is a 400.
 */
export function asEnum<T extends string>(
  v: unknown,
  field: string,
  allowed: readonly T[],
): T {
  const s = asText(v)
  if (allowed.includes(s as T)) return s as T
  throw new ApiError(400, `${field} must be one of: ${allowed.join(', ')}`)
}

/** Same as `asEnum` but tolerates empty input so callers can keep "no filter". */
export function optEnum<T extends string>(
  v: unknown,
  field: string,
  allowed: readonly T[],
): T | null {
  if (v === null || v === undefined || asText(v) === '') return null
  return asEnum(v, field, allowed)
}

/** Email shape + length cap (RFC-ish: local@domain.tld, no spaces). */
export function asEmail(v: unknown): string {
  const s = asText(v).toLowerCase()
  if (s.length === 0) throw new ApiError(400, 'Email is required')
  if (s.length > 254) throw new ApiError(400, 'Email must be 254 characters or fewer')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ApiError(400, 'Invalid email address')
  return s
}

/**
 * Password length bounds.
 *
 * Lower bound 8 matches the existing register route. Upper bound 128 because
 * bcrypt silently hashes only the FIRST 72 BYTES, so allowing megabyte-long
 * "passwords" just wastes CPU and stores a value the user can never reproduce.
 */
export function asPassword(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  if (s.length === 0) throw new ApiError(400, 'Password is required')
  if (s.length < 8) throw new ApiError(400, 'Password must be at least 8 characters')
  if (s.length > 128) throw new ApiError(400, 'Password must be 128 characters or fewer')
  return s
}

/** Local midnight for a Date that may carry a time component. */
export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

/**
 * 23:59:59.999 on the same local calendar day.
 *
 * A due date of "March 2" should not turn overdue at 00:00 on March 2 - the
 * borrower still has all of that day. Storing the end of the day makes the
 * hourly overdue sweep behave the way people actually read the date, without
 * having to change the existing cron comparisons.
 */
export function endOfDay(d: Date): Date {
  const c = startOfDay(d)
  c.setHours(23, 59, 59, 999)
  return c
}

/** Human-friendly date for error messages (e.g. "Mar 5, 2026"). */
export function prettyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** How far ahead a reservation (or waitlist request) may be placed. */
export const MAX_AHEAD_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Calendar rules shared by reservation creation and waitlist joins, so the
 * two can never drift apart: no past pickup dates, a sane horizon, and a
 * return day strictly after the pickup day.
 *
 * Returns the return day normalized to end-of-day - the shape the database
 * stores ("due March 2" must not count as overdue the instant March 2 begins).
 */
export function assertReservationWindow(pickupDate: Date, returnDay: Date): Date {
  const today = startOfDay(new Date())
  if (pickupDate.getTime() < today.getTime()) {
    throw new ApiError(400, 'Reservation date cannot be in the past')
  }
  const horizon = new Date(today.getTime() + MAX_AHEAD_DAYS * DAY_MS)
  if (pickupDate.getTime() > horizon.getTime()) {
    throw new ApiError(400, `Reservations can only be made up to ${MAX_AHEAD_DAYS} days in advance`)
  }
  if (returnDay.getTime() <= pickupDate.getTime()) {
    throw new ApiError(400, 'Return date must be after the reservation date')
  }
  return endOfDay(returnDay)
}
