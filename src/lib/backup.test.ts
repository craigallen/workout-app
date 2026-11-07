import { describe, expect, it } from 'vitest'
import sheetCsv from '../../Weightlifting Tracking.csv?raw'
import type { Activity, Measurement, Settings } from '../types'
import { activityKey, backupToJson, createBackup, measurementKey, parseBackup, planImport, sessionKey } from './backup'
import { parseSessionsCsv } from './csv'
import { act, e, m, s } from './test-helpers'

const settings: Settings = { weeklyTarget: 4, schemaVersion: 1 }

const sessions = [
  {
    ...s('2026-10-01', { workout: 'A', length: 'Full', minutes: 35, energy: 4, notes: 'good "day"', entries: [e('latPulldown', 6, [12, 12, 12]), e('plank', null, [45])] }),
    createdAt: { seconds: 1790000000, nanoseconds: 123000000 },
    updatedAt: { seconds: 1790000500, nanoseconds: 0 },
  },
  {
    ...s('2026-10-03', { easyWeek: true, source: 'sheetImport', entries: [e('gobletSquat', 25, [15, 15])] }),
    createdAt: null,
    updatedAt: null,
  },
]
const measurements = [m('2026-10-01', { weightLb: 182.4, waistIn: 36.5, bodyFatPct: null, notes: 'am' })]
const activities = [act('2026-10-02', 'Yoga', 20, 'flow')]

describe('JSON backup', () => {
  const now = new Date('2026-11-07T15:00:00Z')

  it('has the spec shape', () => {
    const b = createBackup({ settings, sessions, measurements, activities }, now)
    expect(Object.keys(b)).toEqual(['schemaVersion', 'exportedAt', 'settings', 'sessions', 'measurements', 'activities'])
    expect(b.schemaVersion).toBe(1)
    expect(b.exportedAt).toBe('2026-11-07T15:00:00.000Z')
  })

  it('export → restore recreates every session, measurement, activity and setting exactly', () => {
    const json = backupToJson(createBackup({ settings, sessions, measurements, activities }, now))
    const { backup, errors } = parseBackup(json)
    expect(errors).toEqual([])
    expect(backup?.settings).toEqual(settings)
    expect(backup?.sessions).toEqual(sessions)
    expect(backup?.measurements).toEqual(measurements)
    expect(backup?.activities).toEqual(activities)
  })

  it('stores Firestore Timestamps as plain seconds/nanoseconds', () => {
    // A real Timestamp has methods too; only the data fields are kept.
    const ts = { seconds: 5, nanoseconds: 6, toDate: () => new Date(5000) }
    const b = createBackup({ settings, sessions: [{ ...sessions[0], createdAt: ts }], measurements: [], activities: [] }, now)
    expect(b.sessions[0].createdAt).toEqual({ seconds: 5, nanoseconds: 6 })
    expect(JSON.parse(backupToJson(b)).sessions[0].createdAt).toEqual({ seconds: 5, nanoseconds: 6 })
  })

  it('rejects files that are not a backup', () => {
    expect(parseBackup('not json').backup).toBeNull()
    expect(parseBackup('[]').backup).toBeNull()
    expect(parseBackup('{"schemaVersion": 99, "sessions": [], "measurements": [], "activities": [], "settings": {}}').errors[0].message).toMatch(/schemaVersion/)
    expect(parseBackup('{"schemaVersion": 1}').backup).toBeNull()
  })

  it('reports invalid records and keeps the valid ones', () => {
    const b = JSON.parse(backupToJson(createBackup({ settings, sessions, measurements, activities }, now)))
    b.sessions[1].date = '10/3/26'
    b.activities.push({ id: 'x', date: '2026-10-04', type: 'Swim', minutes: 10, notes: '' })
    const { backup, errors } = parseBackup(JSON.stringify(b))
    expect(backup?.sessions).toHaveLength(1)
    expect(backup?.activities).toHaveLength(1)
    expect(errors.map((x) => x.message)).toEqual([expect.stringMatching(/^session #2: date/), expect.stringMatching(/^activity #2: type/)])
  })
})

describe('duplicate matching', () => {
  it('sessions match on date and entries, in any order', () => {
    const a = s('2026-10-01', { entries: [e('latPulldown', 5, [12, 12]), e('plank', null, [30])], notes: 'x' })
    const b = s('2026-10-01', { entries: [e('plank', null, [30]), e('latPulldown', 5, [12, 12])], notes: 'different notes' })
    expect(sessionKey(a)).toBe(sessionKey(b))
    expect(sessionKey(a)).not.toBe(sessionKey({ ...a, date: '2026-10-02' }))
    expect(sessionKey(a)).not.toBe(sessionKey({ ...a, entries: [e('latPulldown', 6, [12, 12]), e('plank', null, [30])] }))
    expect(sessionKey(a)).not.toBe(sessionKey({ ...a, entries: [e('latPulldown', 5, [12, 11]), e('plank', null, [30])] }))
  })

  it('measurements and activities match on all fields', () => {
    const x = m('2026-10-01', { weightLb: 180 })
    const xCopy: Measurement = { ...x, id: 'other' }
    expect(measurementKey(x)).toBe(measurementKey(xCopy))
    expect(measurementKey(x)).not.toBe(measurementKey({ ...x, notes: 'n' }))
    const y = act('2026-10-01', 'Walk', 30)
    const yCopy: Activity = { ...y, id: 'other' }
    expect(activityKey(y)).toBe(activityKey(yCopy))
    expect(activityKey(y)).not.toBe(activityKey({ ...y, minutes: 31 }))
  })

  it('importing the Sheet CSV twice adds nothing the second time (acceptance)', () => {
    const parsed = parseSessionsCsv(sheetCsv).records
    const first = planImport(parsed, [], sessionKey)
    expect(first.toAdd).toHaveLength(13)
    expect(first.duplicates).toBe(0)
    expect(first.dateRange).toEqual({ from: '2026-06-21', to: '2026-09-30' })
    const second = planImport(parsed, first.toAdd, sessionKey)
    expect(second.toAdd).toHaveLength(0)
    expect(second.duplicates).toBe(13)
  })

  it('also skips repeats inside the same file', () => {
    const r = planImport([act('2026-10-01', 'Walk', 30), act('2026-10-01', 'Walk', 30)], [], activityKey)
    expect(r.toAdd).toHaveLength(1)
    expect(r.duplicates).toBe(1)
    expect(planImport([], [], activityKey).dateRange).toBeNull()
  })
})
