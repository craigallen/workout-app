// Builders shared by the unit tests (not imported by app code).
import type { Activity, Entry, Measurement, SessionData } from '../types'

let seq = 0

export function e(exerciseId: string, load: number | null, sets: number[]): Entry {
  return { exerciseId, load, sets }
}

export function s(date: string, opts: Partial<SessionData> = {}): SessionData {
  return {
    id: `s${++seq}`,
    date,
    workout: null,
    length: null,
    easyWeek: false,
    minutes: null,
    energy: null,
    notes: '',
    entries: [],
    source: 'app',
    ...opts,
  }
}

export function m(date: string, opts: Partial<Measurement> = {}): Measurement {
  return { id: `m${++seq}`, date, weightLb: null, waistIn: null, bodyFatPct: null, notes: '', ...opts }
}

export function act(date: string, type: Activity['type'], minutes: number, notes = ''): Activity {
  return { id: `a${++seq}`, date, type, minutes, notes }
}

/** Give parsed (id-less) records ids so they can be used as stored data. */
export function withIds<T extends object>(records: T[]): (T & { id: string })[] {
  return records.map((r) => ({ ...r, id: `r${++seq}` }))
}
