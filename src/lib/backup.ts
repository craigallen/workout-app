// JSON full backup + restore, duplicate matching and import previews.
import { SCHEMA_VERSION } from '../plan'
import type { Activity, Entry, Measurement, NewSession, SessionData, Settings } from '../types'
import { isISODate } from './dates'
import type { NewActivity, NewMeasurement, RowError } from './csv'

/** Firestore Timestamp's data fields; a real Timestamp satisfies this shape. */
export interface TimestampLike {
  seconds: number
  nanoseconds: number
}

export type BackupSession = SessionData & { createdAt: TimestampLike | null; updatedAt: TimestampLike | null }

export interface Backup {
  schemaVersion: number
  exportedAt: string // ISO 8601
  settings: Settings
  sessions: BackupSession[]
  measurements: Measurement[]
  activities: Activity[]
}

const plainTs = (t: TimestampLike | null | undefined): TimestampLike | null =>
  t ? { seconds: t.seconds, nanoseconds: t.nanoseconds } : null

/** Every field of every record, so a restore loses nothing. */
export function createBackup(
  data: {
    settings: Settings
    sessions: readonly (SessionData & { createdAt?: TimestampLike | null; updatedAt?: TimestampLike | null })[]
    measurements: readonly Measurement[]
    activities: readonly Activity[]
  },
  now: Date = new Date(),
): Backup {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: { weeklyTarget: data.settings.weeklyTarget, schemaVersion: data.settings.schemaVersion },
    sessions: data.sessions.map((s) => ({
      id: s.id,
      date: s.date,
      workout: s.workout,
      length: s.length,
      easyWeek: s.easyWeek,
      minutes: s.minutes,
      energy: s.energy,
      notes: s.notes,
      entries: s.entries.map((e) => ({ exerciseId: e.exerciseId, load: e.load, sets: [...e.sets] })),
      source: s.source,
      createdAt: plainTs(s.createdAt),
      updatedAt: plainTs(s.updatedAt),
    })),
    measurements: data.measurements.map((m) => ({ ...m })),
    activities: data.activities.map((a) => ({ ...a })),
  }
}

export function backupToJson(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

// ---------------------------------------------------------------- validation

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOrNull = (v: unknown) => v === null || isNum(v)

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function checkTs(v: unknown, name: string): TimestampLike | null {
  if (v === null || v === undefined) return null
  check(isObj(v) && isNum(v.seconds) && isNum(v.nanoseconds), `${name} is not a timestamp`)
  return { seconds: (v as Obj).seconds as number, nanoseconds: (v as Obj).nanoseconds as number }
}

function checkEntry(v: unknown): Entry {
  check(isObj(v), 'entry is not an object')
  const e = v as Obj
  check(typeof e.exerciseId === 'string', 'entry exerciseId missing')
  check(numOrNull(e.load), 'entry load must be a number or null')
  check(Array.isArray(e.sets) && e.sets.every(isNum), 'entry sets must be numbers')
  return { exerciseId: e.exerciseId as string, load: e.load as number | null, sets: [...(e.sets as number[])] }
}

function checkSession(v: unknown): BackupSession {
  check(isObj(v), 'not an object')
  const s = v as Obj
  check(typeof s.id === 'string' && s.id !== '', 'id missing')
  check(typeof s.date === 'string' && isISODate(s.date), 'date must be YYYY-MM-DD')
  check(s.workout === null || s.workout === 'A' || s.workout === 'B', 'workout must be A, B or null')
  check(s.length === null || s.length === 'Full' || s.length === 'Short' || s.length === 'Minimum', 'length invalid')
  check(typeof s.easyWeek === 'boolean', 'easyWeek must be true/false')
  check(numOrNull(s.minutes), 'minutes must be a number or null')
  check(s.energy === null || [1, 2, 3, 4, 5].includes(s.energy as number), 'energy must be 1-5 or null')
  check(typeof s.notes === 'string', 'notes must be text')
  check(Array.isArray(s.entries), 'entries must be a list')
  check(s.source === 'app' || s.source === 'sheetImport', 'source invalid')
  return {
    id: s.id as string,
    date: s.date as string,
    workout: s.workout as BackupSession['workout'],
    length: s.length as BackupSession['length'],
    easyWeek: s.easyWeek as boolean,
    minutes: s.minutes as number | null,
    energy: s.energy as BackupSession['energy'],
    notes: s.notes as string,
    entries: (s.entries as unknown[]).map(checkEntry),
    source: s.source as BackupSession['source'],
    createdAt: checkTs(s.createdAt, 'createdAt'),
    updatedAt: checkTs(s.updatedAt, 'updatedAt'),
  }
}

function checkMeasurement(v: unknown): Measurement {
  check(isObj(v), 'not an object')
  const m = v as Obj
  check(typeof m.id === 'string' && m.id !== '', 'id missing')
  check(typeof m.date === 'string' && isISODate(m.date), 'date must be YYYY-MM-DD')
  check(numOrNull(m.weightLb) && numOrNull(m.waistIn) && numOrNull(m.bodyFatPct), 'weight, waist and body fat must be numbers or null')
  check(typeof m.notes === 'string', 'notes must be text')
  return { id: m.id as string, date: m.date as string, weightLb: m.weightLb as number | null, waistIn: m.waistIn as number | null, bodyFatPct: m.bodyFatPct as number | null, notes: m.notes as string }
}

function checkActivity(v: unknown): Activity {
  check(isObj(v), 'not an object')
  const a = v as Obj
  check(typeof a.id === 'string' && a.id !== '', 'id missing')
  check(typeof a.date === 'string' && isISODate(a.date), 'date must be YYYY-MM-DD')
  check(a.type === 'Walk' || a.type === 'Yoga' || a.type === 'Other', 'type must be Walk, Yoga or Other')
  check(isNum(a.minutes), 'minutes must be a number')
  check(typeof a.notes === 'string', 'notes must be text')
  return { id: a.id as string, date: a.date as string, type: a.type as Activity['type'], minutes: a.minutes as number, notes: a.notes as string }
}

export interface RestoreResult {
  backup: Backup | null
  /** `row` is the 1-based index within its list; `message` names the list. */
  errors: RowError[]
}

/** Parse and validate a JSON backup. Invalid records are reported and left out. */
export function parseBackup(text: string): RestoreResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { backup: null, errors: [{ row: 0, message: 'Not valid JSON.' }] }
  }
  if (!isObj(raw)) return { backup: null, errors: [{ row: 0, message: 'Not a workouts backup.' }] }
  if (!isNum(raw.schemaVersion) || raw.schemaVersion > SCHEMA_VERSION) {
    return { backup: null, errors: [{ row: 0, message: `Unsupported backup schemaVersion ${String(raw.schemaVersion)}.` }] }
  }
  if (!Array.isArray(raw.sessions) || !Array.isArray(raw.measurements) || !Array.isArray(raw.activities) || !isObj(raw.settings)) {
    return { backup: null, errors: [{ row: 0, message: 'Backup is missing sessions, measurements, activities or settings.' }] }
  }
  const errors: RowError[] = []
  function all<T>(list: unknown[], name: string, fn: (v: unknown) => T): T[] {
    const out: T[] = []
    list.forEach((v, i) => {
      try {
        out.push(fn(v))
      } catch (e) {
        errors.push({ row: i + 1, message: `${name} #${i + 1}: ${(e as Error).message}` })
      }
    })
    return out
  }
  const st = raw.settings
  const settings: Settings = {
    weeklyTarget: isNum(st.weeklyTarget) ? st.weeklyTarget : 3,
    schemaVersion: isNum(st.schemaVersion) ? st.schemaVersion : SCHEMA_VERSION,
  }
  if (!isNum(st.weeklyTarget)) errors.push({ row: 0, message: 'settings: weeklyTarget missing, using 3' })
  return {
    backup: {
      schemaVersion: raw.schemaVersion,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      settings,
      sessions: all(raw.sessions, 'session', checkSession),
      measurements: all(raw.measurements, 'measurement', checkMeasurement),
      activities: all(raw.activities, 'activity', checkActivity),
    },
    errors,
  }
}

// ---------------------------------------------------------------- duplicates

/** A session matches when the date and the entries are the same (entry order ignored). */
export function sessionKey(s: Pick<NewSession, 'date' | 'entries'>): string {
  const entries = [...s.entries]
    .map((e) => `${e.exerciseId}:${e.load ?? '-'}:${e.sets.join('/')}`)
    .sort()
  return `${s.date}|${entries.join(';')}`
}

/** Measurements match on all fields (id excluded). */
export function measurementKey(m: NewMeasurement): string {
  return JSON.stringify([m.date, m.weightLb, m.waistIn, m.bodyFatPct, m.notes])
}

/** Activities match on all fields (id excluded). */
export function activityKey(a: NewActivity): string {
  return JSON.stringify([a.date, a.type, a.minutes, a.notes])
}

export interface ImportPlan<T> {
  toAdd: T[]
  /** Records already stored, or repeated earlier in the same file. */
  duplicates: number
  /** Date range of the parsed records, or null when there are none. */
  dateRange: { from: string; to: string } | null
}

/**
 * Split parsed records into new ones and duplicates of `existing` (or of an
 * earlier record in the same file), so importing a file twice adds nothing.
 */
export function planImport<T extends { date: string }>(incoming: readonly T[], existing: readonly T[], key: (r: T) => string): ImportPlan<T> {
  const seen = new Set(existing.map(key))
  const toAdd: T[] = []
  let duplicates = 0
  for (const r of incoming) {
    const k = key(r)
    if (seen.has(k)) duplicates++
    else {
      seen.add(k)
      toAdd.push(r)
    }
  }
  const dates = incoming.map((r) => r.date).sort()
  return { toAdd, duplicates, dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null }
}
