// CSV parse + export for sessions, measurements and activities (SPEC "CSV and JSON formats").
import { EXERCISES, WORKOUTS } from '../plan'
import type { Activity, ActivityType, Energy, Entry, Length, Measurement, NewSession, SessionData, WorkoutId } from '../types'
import { parseSheetDate, toSheetDate } from './dates'
import { sortByDate } from './rules'

// ================================================================ low-level CSV

/**
 * RFC 4180-style parser: comma separated, fields optionally wrapped in double
 * quotes, `""` inside quotes is a literal quote, quoted fields may contain
 * commas and newlines. Accepts CRLF, LF or CR line endings and a leading BOM.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }
  while (i < src.length) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"' && field === '') {
      quoted = true
      i++
    } else if (c === ',') {
      endField()
      i++
    } else if (c === '\r' || c === '\n') {
      endRow()
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1
    } else {
      field += c
      i++
    }
  }
  // Last row, unless the text ended with a newline.
  if (field !== '' || row.length > 0) endRow()
  return rows
}

function quoteField(value: string): string {
  return /[",\r\n]/.test(value) || value !== value.trim() ? `"${value.replace(/"/g, '""')}"` : value
}

/** Rows to CSV text with CRLF line endings (what Sheets and Excel expect). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(quoteField).join(',')).join('\r\n') + '\r\n'
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// ================================================================ preview types

export interface RowError {
  /** 1-based line in the file (the spreadsheet row number). */
  row: number
  message: string
}

export interface ParseResult<T> {
  records: T[]
  errors: RowError[]
  /** Rows with a date (or nothing) but no data, skipped without an error. */
  emptyRows: number
  /** Header cells that matched no known column; their data is ignored. */
  unknownColumns: string[]
}

// ================================================================ session cells

export interface ParsedCell {
  load: number | null
  sets: number[]
}

/**
 * `6 x 12/12/12`, `25 x 15/15/15`, `15/15/15` or `30/25/0`. Trailing zeros are
 * dropped. Returns null for an empty cell or one with no sets left (skipped),
 * and throws on text that isn't a cell.
 */
export function parseCell(text: string): ParsedCell | null {
  const s = text.trim()
  if (s === '') return null
  const m = /^(?:(\d+(?:\.\d+)?)\s*[xX×]\s*)?(\d+(?:\s*\/\s*\d+)*)$/.exec(s)
  if (!m) throw new Error(`can't read "${s}"`)
  const sets = m[2].split('/').map((x) => Number(x.trim()))
  while (sets.length && sets[sets.length - 1] === 0) sets.pop()
  if (sets.length === 0) return null
  return { load: m[1] === undefined ? null : Number(m[1]), sets }
}

export function formatCell(entry: Pick<Entry, 'load' | 'sets'>): string {
  const sets = entry.sets.join('/')
  return entry.load === null ? sets : `${entry.load} x ${sets}`
}

// ================================================================ sessions CSV

/** Column order and row-1 header text of the old Sheet's Workouts tab. */
export const SHEET_EXERCISE_COLUMNS: { exerciseId: string; header: string }[] = [
  { exerciseId: 'gobletSquat', header: 'Goblet / bodyweight squat' },
  { exerciseId: 'legExtension', header: 'Leg extension' },
  { exerciseId: 'legCurlR', header: 'Leg curl R' },
  { exerciseId: 'legCurlL', header: 'Leg curl L' },
  { exerciseId: 'latPulldown', header: 'Lat pulldown' },
  { exerciseId: 'seatedRow', header: 'Seated row' },
  { exerciseId: 'chestPress', header: 'Chest press' },
  { exerciseId: 'lateralRaise', header: 'Lateral raise / upright row' },
  { exerciseId: 'preacherCurl', header: 'Preacher curl' },
  { exerciseId: 'tricepsPushdown', header: 'Triceps pushdown' },
  { exerciseId: 'plank', header: 'Plank / cable crunch' },
  { exerciseId: 'romanianDeadlift', header: 'Romanian deadlift (KB/DB)' },
]

type SessionField = 'date' | 'minutes' | 'workout' | 'length' | 'energy' | 'easyWeek' | 'notes'

const FIELD_HEADERS: Record<SessionField, string[]> = {
  date: ['Exercise', 'Date'],
  minutes: ['Time', 'Minutes'],
  workout: ['A/B', 'Workout'],
  length: ['Session', 'Length'],
  energy: ['Energy (1-5)', 'Energy'],
  easyWeek: ['Easy week'],
  notes: ['Notes'],
}

type ColumnKey = { kind: 'field'; field: SessionField } | { kind: 'exercise'; exerciseId: string }

/** Header text (Sheet wording or the app's exercise name) to column meaning. */
function sessionHeaderMap(): Map<string, ColumnKey> {
  const map = new Map<string, ColumnKey>()
  for (const [field, names] of Object.entries(FIELD_HEADERS) as [SessionField, string[]][]) {
    for (const n of names) map.set(norm(n), { kind: 'field', field })
  }
  for (const { exerciseId, header } of SHEET_EXERCISE_COLUMNS) {
    map.set(norm(header), { kind: 'exercise', exerciseId })
    map.set(norm(EXERCISES[exerciseId].name), { kind: 'exercise', exerciseId })
  }
  return map
}

function targetText(exerciseId: string): string {
  const e = EXERCISES[exerciseId]
  const item = WORKOUTS.A.find((i) => i.exerciseId === exerciseId) ?? WORKOUTS.B.find((i) => i.exerciseId === exerciseId)
  return `${item?.sets ?? ''} x ${e.repMin}-${e.repMax}${e.unit === 'seconds' ? ' sec' : ''}`
}

/**
 * Sessions CSV in the old Sheet's Workouts layout: three header rows (names,
 * station, target), then one row per session, oldest first. Easy week and
 * Notes are added at the end.
 */
export function sessionsToCsv(sessions: readonly SessionData[]): string {
  const ex = SHEET_EXERCISE_COLUMNS
  const rows: string[][] = [
    ['Exercise', ...ex.map((c) => c.header), 'Time', 'A/B', 'Session', 'Energy (1-5)', 'Easy week', 'Notes'],
    ['Station', ...ex.map((c) => EXERCISES[c.exerciseId].station), '', '--', '--', '--', '--', '--'],
    ['Target', ...ex.map((c) => targetText(c.exerciseId)), '', 'A or B', 'Full / Short / Minimum', '1 = drained, 5 = great', 'Yes = easy week', ''],
  ]
  for (const s of sortByDate(sessions)) {
    const cells = ex.map((c) => {
      const entry = s.entries.find((e) => e.exerciseId === c.exerciseId)
      return entry ? formatCell(entry) : ''
    })
    rows.push([
      toSheetDate(s.date),
      ...cells,
      s.minutes === null ? '' : String(s.minutes),
      s.workout ?? '',
      s.length ?? '',
      s.energy === null ? '' : String(s.energy),
      s.easyWeek ? 'Yes' : '',
      s.notes,
    ])
  }
  return toCsv(rows)
}

const LENGTHS: Length[] = ['Full', 'Short', 'Minimum']

function parseOptionalNumber(text: string, what: string): number | null {
  const s = text.trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${what} "${s}" is not a number`)
  return n
}

function parseYes(text: string): boolean {
  const s = norm(text)
  if (['', 'no', 'n', 'false', '0'].includes(s)) return false
  if (['yes', 'y', 'true', '1', 'x'].includes(s)) return true
  throw new Error(`Easy week "${text.trim()}" should be Yes or empty`)
}

/**
 * Import a sessions CSV: the old Sheet's Workouts tab or the app's own export.
 * Columns are matched by row-1 header text, never by position; data starts on
 * row 4. Files with an Easy week or Notes column are treated as app exports
 * (source 'app'), others as Sheet history (source 'sheetImport').
 */
export function parseSessionsCsv(text: string): ParseResult<NewSession> {
  const rows = parseCsv(text)
  const result: ParseResult<NewSession> = { records: [], errors: [], emptyRows: 0, unknownColumns: [] }
  if (rows.length === 0) {
    result.errors.push({ row: 1, message: 'The file is empty.' })
    return result
  }
  const map = sessionHeaderMap()
  const columns: (ColumnKey | null)[] = rows[0].map((h) => {
    if (h.trim() === '') return null
    const key = map.get(norm(h))
    if (!key) result.unknownColumns.push(h.trim())
    return key ?? null
  })
  const fieldIndex = (f: SessionField) => columns.findIndex((c) => c?.kind === 'field' && c.field === f)
  if (fieldIndex('date') < 0) {
    result.errors.push({ row: 1, message: 'No date column (expected a header "Exercise" or "Date" in row 1).' })
    return result
  }
  const source = fieldIndex('easyWeek') >= 0 || fieldIndex('notes') >= 0 ? 'app' : 'sheetImport'

  for (let r = 3; r < rows.length; r++) {
    const cells = rows[r]
    const rowNo = r + 1
    const get = (f: SessionField) => {
      const i = fieldIndex(f)
      return i < 0 ? '' : (cells[i] ?? '')
    }
    if (cells.every((c) => c.trim() === '')) {
      result.emptyRows++
      continue
    }
    try {
      const dateText = get('date')
      const date = parseSheetDate(dateText)
      if (!date) throw new Error(`date "${dateText.trim()}" should be m/d/yy`)
      const entries: Entry[] = []
      columns.forEach((col, i) => {
        if (col?.kind !== 'exercise') return
        let cell: ParsedCell | null
        try {
          cell = parseCell(cells[i] ?? '')
        } catch (e) {
          throw new Error(`${rows[0][i].trim()}: ${(e as Error).message}`)
        }
        if (cell) entries.push({ exerciseId: col.exerciseId, load: cell.load, sets: cell.sets })
      })
      const workoutText = get('workout').trim().toUpperCase()
      if (workoutText !== '' && workoutText !== 'A' && workoutText !== 'B') throw new Error(`A/B "${get('workout').trim()}" should be A or B`)
      const lengthText = get('length').trim()
      const length = lengthText === '' ? null : (LENGTHS.find((l) => norm(l) === norm(lengthText)) ?? null)
      if (lengthText !== '' && !length) throw new Error(`Session "${lengthText}" should be Full, Short or Minimum`)
      const energy = parseOptionalNumber(get('energy'), 'Energy')
      if (energy !== null && ![1, 2, 3, 4, 5].includes(energy)) throw new Error(`Energy "${energy}" should be 1 to 5`)
      const session: NewSession = {
        date,
        workout: workoutText === '' ? null : (workoutText as WorkoutId),
        length,
        easyWeek: parseYes(get('easyWeek')),
        minutes: parseOptionalNumber(get('minutes'), 'Time'),
        energy: energy as Energy | null,
        notes: get('notes'),
        entries,
        source,
      }
      const isEmpty =
        entries.length === 0 && session.minutes === null && session.workout === null && session.length === null && session.energy === null && session.notes.trim() === '' && !session.easyWeek
      if (isEmpty) {
        result.emptyRows++
        continue
      }
      result.records.push(session)
    } catch (e) {
      result.errors.push({ row: rowNo, message: (e as Error).message })
    }
  }
  return result
}

// ================================================================ simple one-header CSVs

interface SimpleColumn<T> {
  header: string
  aliases?: string[]
  required?: boolean
  write: (rec: T) => string
}

function simpleExport<T extends { date: string }>(cols: SimpleColumn<T>[], records: readonly T[]): string {
  return toCsv([cols.map((c) => c.header), ...sortByDate(records).map((r) => cols.map((c) => c.write(r)))])
}

function simpleParse<T>(
  text: string,
  cols: SimpleColumn<T>[],
  build: (get: (header: string) => string) => T,
): ParseResult<T> {
  const rows = parseCsv(text)
  const result: ParseResult<T> = { records: [], errors: [], emptyRows: 0, unknownColumns: [] }
  if (rows.length === 0) {
    result.errors.push({ row: 1, message: 'The file is empty.' })
    return result
  }
  const index = new Map<string, number>()
  rows[0].forEach((h, i) => {
    if (h.trim() === '') return
    const col = cols.find((c) => [c.header, ...(c.aliases ?? [])].some((n) => norm(n) === norm(h)))
    if (col) index.set(col.header, i)
    else result.unknownColumns.push(h.trim())
  })
  const missing = cols.filter((c) => c.required && !index.has(c.header)).map((c) => c.header)
  if (missing.length) {
    result.errors.push({ row: 1, message: `Missing column(s): ${missing.join(', ')}.` })
    return result
  }
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]
    if (cells.every((c) => c.trim() === '')) {
      result.emptyRows++
      continue
    }
    const get = (header: string) => {
      const i = index.get(header)
      return i === undefined ? '' : (cells[i] ?? '')
    }
    try {
      result.records.push(build(get))
    } catch (e) {
      result.errors.push({ row: r + 1, message: (e as Error).message })
    }
  }
  return result
}

function requireDate(text: string): string {
  const d = parseSheetDate(text)
  if (!d) throw new Error(`date "${text.trim()}" should be m/d/yy`)
  return d
}

const num = (n: number | null) => (n === null ? '' : String(n))

// ---------------------------------------------------------------- measurements

const MEASUREMENT_COLS: SimpleColumn<Measurement>[] = [
  { header: 'Date', required: true, write: (m) => toSheetDate(m.date) },
  { header: 'Weight (lb)', aliases: ['Weight'], write: (m) => num(m.weightLb) },
  { header: 'Waist (in)', aliases: ['Waist'], write: (m) => num(m.waistIn) },
  { header: 'Body fat (%)', aliases: ['Body fat'], write: (m) => num(m.bodyFatPct) },
  { header: 'Notes', write: (m) => m.notes },
]

export type NewMeasurement = Omit<Measurement, 'id'>
export type NewActivity = Omit<Activity, 'id'>

export function measurementsToCsv(records: readonly Measurement[]): string {
  return simpleExport(MEASUREMENT_COLS, records)
}

export function parseMeasurementsCsv(text: string): ParseResult<NewMeasurement> {
  return simpleParse<NewMeasurement>(text, MEASUREMENT_COLS as unknown as SimpleColumn<NewMeasurement>[], (get) => ({
    date: requireDate(get('Date')),
    weightLb: parseOptionalNumber(get('Weight (lb)'), 'Weight'),
    waistIn: parseOptionalNumber(get('Waist (in)'), 'Waist'),
    bodyFatPct: parseOptionalNumber(get('Body fat (%)'), 'Body fat'),
    notes: get('Notes'),
  }))
}

// ---------------------------------------------------------------- walks and yoga

const ACTIVITY_COLS: SimpleColumn<Activity>[] = [
  { header: 'Date', required: true, write: (a) => toSheetDate(a.date) },
  { header: 'Activity', aliases: ['Type'], required: true, write: (a) => a.type },
  { header: 'Minutes', required: true, write: (a) => String(a.minutes) },
  { header: 'Notes', write: (a) => a.notes },
]

const ACTIVITY_TYPES: ActivityType[] = ['Walk', 'Yoga', 'Other']

export function activitiesToCsv(records: readonly Activity[]): string {
  return simpleExport(ACTIVITY_COLS, records)
}

export function parseActivitiesCsv(text: string): ParseResult<NewActivity> {
  return simpleParse<NewActivity>(text, ACTIVITY_COLS as unknown as SimpleColumn<NewActivity>[], (get) => {
    const typeText = get('Activity').trim()
    const type = ACTIVITY_TYPES.find((t) => norm(t) === norm(typeText))
    if (!type) throw new Error(`Activity "${typeText}" should be Walk, Yoga or Other`)
    const minutes = parseOptionalNumber(get('Minutes'), 'Minutes')
    if (minutes === null) throw new Error('Minutes is empty')
    return { date: requireDate(get('Date')), type, minutes, notes: get('Notes') }
  })
}

// ---------------------------------------------------------------- file names

export function exportFileName(kind: 'sessions' | 'measurements' | 'walks-yoga' | 'backup', today: string): string {
  return `workouts-${kind}-${today}.${kind === 'backup' ? 'json' : 'csv'}`
}
