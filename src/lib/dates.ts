// Local-date helpers. Stored dates are plain 'YYYY-MM-DD' strings in local
// time. Day arithmetic runs on UTC day numbers so DST shifts never move a date.

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

function parts(iso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${iso}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function fromYMD(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

/** Today's local date (or the local date of `now`). */
export function toISODate(now: Date = new Date()): string {
  return fromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function dayNumber(iso: string): number {
  const [y, m, d] = parts(iso)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

function fromDayNumber(n: number): string {
  const dt = new Date(n * DAY_MS)
  return fromYMD(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

export function addDays(iso: string, n: number): string {
  return fromDayNumber(dayNumber(iso) + n)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a)
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = parts(iso)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Monday of the Monday–Sunday week containing `iso`. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

export function endOfWeek(iso: string): string {
  return addDays(startOfWeek(iso), 6)
}

/** Days left in the week including `iso` (Mon = 7 … Sun = 1). */
export function daysLeftInWeek(iso: string): number {
  return 7 - weekdayIndex(iso)
}

/** 'YYYY-MM' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function monthStart(key: string): string {
  return `${key}-01`
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return fromYMD(y, m, last)
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** The last full calendar month before the month containing `today`. */
export function lastFullMonth(today: string): string {
  return addMonths(monthKey(today), -1)
}

export function monthLabel(key: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const [y, m] = key.split('-').map(Number)
  return `${names[m - 1]} ${y}`
}

/** Sheet format: m/d/yy (no leading zeros). */
export function toSheetDate(iso: string): string {
  const [y, m, d] = parts(iso)
  return `${m}/${d}/${pad(y % 100)}`
}

/**
 * Parse m/d/yy or m/d/yyyy (two-digit years are 20yy), or YYYY-MM-DD.
 * Returns null when the text is not a real date.
 */
export function parseSheetDate(text: string): string | null {
  const s = text.trim()
  if (isISODate(s)) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s)
  if (!m) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const iso = fromYMD(y, Number(m[1]), Number(m[2]))
  return isISODate(iso) ? iso : null
}
