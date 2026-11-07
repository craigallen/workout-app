import { describe, expect, it } from 'vitest'
import sheetCsv from '../../Weightlifting Tracking.csv?raw'
import type { NewSession } from '../types'
import {
  activitiesToCsv,
  exportFileName,
  formatCell,
  measurementsToCsv,
  parseActivitiesCsv,
  parseCell,
  parseCsv,
  parseMeasurementsCsv,
  parseSessionsCsv,
  sessionsToCsv,
  toCsv,
} from './csv'
import { act, e, m, s, withIds } from './test-helpers'

const strip = <T extends { id: string }>(r: T): Omit<T, 'id'> => {
  const { id, ...rest } = r
  void id
  return rest
}

describe('parseCsv (hand-written, RFC 4180 style)', () => {
  it('splits plain fields and keeps empty ones', () => {
    expect(parseCsv('a,b,,d\n1,2,3,4')).toEqual([['a', 'b', '', 'd'], ['1', '2', '3', '4']])
  })

  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    expect(parseCsv('x,"1 = drained, 5 = great","say ""hi""","line1\nline2"\r\n')).toEqual([
      ['x', '1 = drained, 5 = great', 'say "hi"', 'line1\nline2'],
    ])
  })

  it('accepts CRLF, LF and CR endings, a BOM, and no trailing newline', () => {
    expect(parseCsv('﻿a,b\r\nc,d\re,f\ng,h')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']])
  })

  it('keeps a final empty field', () => {
    expect(parseCsv('a,\r\n')).toEqual([['a', '']])
  })

  it('round-trips through toCsv', () => {
    const rows = [['plain', 'with, comma', 'with "quote"', 'multi\nline', ' padded ', '']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('session cells', () => {
  it('reads every cell format in the spec', () => {
    expect(parseCell('6 x 12/12/12')).toEqual({ load: 6, sets: [12, 12, 12] })
    expect(parseCell('25 x 15/15/15')).toEqual({ load: 25, sets: [15, 15, 15] })
    expect(parseCell('15/15/15')).toEqual({ load: null, sets: [15, 15, 15] })
    expect(parseCell('17.5 x 10/10')).toEqual({ load: 17.5, sets: [10, 10] })
  })

  it('drops trailing zeros on plank seconds', () => {
    expect(parseCell('30/25/0')).toEqual({ load: null, sets: [30, 25] })
    expect(parseCell('30/0/0')).toEqual({ load: null, sets: [30] })
  })

  it('empty cell or all zeros = skipped', () => {
    expect(parseCell('')).toBeNull()
    expect(parseCell('  ')).toBeNull()
    expect(parseCell('0/0/0')).toBeNull()
  })

  it('rejects text that is not a cell', () => {
    expect(() => parseCell('six x 12')).toThrow()
    expect(() => parseCell('6 x')).toThrow()
    expect(() => parseCell('12//12')).toThrow()
  })

  it('formats cells', () => {
    expect(formatCell(e('latPulldown', 5, [12, 12, 12]))).toBe('5 x 12/12/12')
    expect(formatCell(e('plank', null, [30, 25]))).toBe('30/25')
  })
})

describe('importing the old Sheet Workouts CSV (acceptance)', () => {
  const result = parseSessionsCsv(sheetCsv)

  it('creates 13 sessions dated 6/21/26 to 9/30/26 with no parse errors', () => {
    expect(result.errors).toEqual([])
    expect(result.unknownColumns).toEqual([])
    expect(result.records).toHaveLength(13)
    expect(result.records[0].date).toBe('2026-06-21')
    expect(result.records[12].date).toBe('2026-09-30')
    expect(result.emptyRows).toBe(1) // the 11/6/26 row with no data
  })

  it('reads the 6/21/26 lat pulldown as load 5, sets 12/12/12', () => {
    const lat = result.records[0].entries.find((x) => x.exerciseId === 'latPulldown')
    expect(lat).toEqual(e('latPulldown', 5, [12, 12, 12]))
  })

  it('maps the Sheet header names to plan exercises', () => {
    const first = result.records[0]
    expect(first.entries.find((x) => x.exerciseId === 'gobletSquat')).toEqual(e('gobletSquat', null, [15, 15, 15]))
    expect(first.entries.find((x) => x.exerciseId === 'legCurlR')).toEqual(e('legCurlR', 1, [12, 12, 12]))
    expect(first.entries.find((x) => x.exerciseId === 'plank')).toEqual(e('plank', null, [30]))
    expect(first.entries.some((x) => x.exerciseId === 'romanianDeadlift')).toBe(false)
  })

  it('imported sessions carry Time, no workout/length/energy, and source sheetImport', () => {
    expect(result.records[0]).toMatchObject({ minutes: 55, workout: null, length: null, energy: null, easyWeek: false, notes: '', source: 'sheetImport' })
    expect(result.records[11].minutes).toBeNull() // 9/7/26 has no Time
  })

  it('a plank of 0/0/0 is not saved', () => {
    expect(result.records[1].entries.some((x) => x.exerciseId === 'plank')).toBe(false)
  })

  it('skipped exercises have no entry', () => {
    expect(result.records[2].entries.map((x) => x.exerciseId).sort()).toEqual(
      ['chestPress', 'gobletSquat', 'latPulldown', 'legCurlL', 'legCurlR', 'legExtension', 'seatedRow'].sort(),
    )
  })
})

describe('sessions CSV import rules', () => {
  const header3 = (row1: string) => `${row1}\r\nStation\r\nTarget\r\n`

  it('maps columns by header text, never by position, and accepts app names', () => {
    const csv = header3('Session,Seated row,A/B,Goblet squat,Date,Energy') + 'Short,4 x 12/12/12,B,25 x 15/15/15,10/2/26,4\r\n'
    const r = parseSessionsCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.records[0]).toMatchObject({
      date: '2026-10-02',
      workout: 'B',
      length: 'Short',
      energy: 4,
      entries: [e('seatedRow', 4, [12, 12, 12]), e('gobletSquat', 25, [15, 15, 15])],
    })
  })

  it('reports bad rows with their row number and keeps the good ones', () => {
    const csv = header3('Exercise,Lat pulldown,Energy (1-5)') + '10/1/26,5 x 12/12/12,\r\nnot a date,5 x 12,\r\n10/3/26,5 x twelve,\r\n10/4/26,,9\r\n'
    const r = parseSessionsCsv(csv)
    expect(r.records.map((x) => x.date)).toEqual(['2026-10-01'])
    expect(r.errors.map((x) => x.row)).toEqual([5, 6, 7])
    expect(r.errors[1].message).toMatch(/Lat pulldown/)
  })

  it('lists unknown columns and needs a date column', () => {
    expect(parseSessionsCsv(header3('Exercise,Lat pulldown,Mystery') + '10/1/26,5 x 12,x\r\n').unknownColumns).toEqual(['Mystery'])
    expect(parseSessionsCsv(header3('Lat pulldown') + '5 x 12\r\n').errors[0].row).toBe(1)
    expect(parseSessionsCsv('').errors).toHaveLength(1)
  })
})

describe('sessions CSV export', () => {
  it('uses the old Workouts layout: 3 header rows, Sheet column order, Easy week and Notes at the end', () => {
    const rows = parseCsv(sessionsToCsv([]))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual([
      'Exercise', 'Goblet / bodyweight squat', 'Leg extension', 'Leg curl R', 'Leg curl L', 'Lat pulldown', 'Seated row', 'Chest press',
      'Lateral raise / upright row', 'Preacher curl', 'Triceps pushdown', 'Plank / cable crunch', 'Romanian deadlift (KB/DB)',
      'Time', 'A/B', 'Session', 'Energy (1-5)', 'Easy week', 'Notes',
    ])
    expect(rows[1][0]).toBe('Station')
    expect(rows[1][1]).toBe('off-machine')
    expect(rows[2][0]).toBe('Target')
    expect(rows[2][5]).toBe('3 x 8-12')
    expect(rows[2][11]).toBe('2 x 30-45 sec')
  })

  it('writes sessions oldest first in m/d/yy with Sheet cells', () => {
    const csv = sessionsToCsv([
      s('2026-10-03', { entries: [e('plank', null, [45, 30])] }),
      s('2026-10-01', { workout: 'A', length: 'Full', minutes: 35, energy: 4, easyWeek: true, notes: 'ok', entries: [e('latPulldown', 5, [12, 12, 12])] }),
    ])
    const rows = parseCsv(csv)
    expect(rows[3]).toEqual(['10/1/26', '', '', '', '', '5 x 12/12/12', '', '', '', '', '', '', '', '35', 'A', 'Full', '4', 'Yes', 'ok'])
    expect(rows[4][0]).toBe('10/3/26')
    expect(rows[4][11]).toBe('45/30')
  })

  it('round-trips app sessions, including easy week and notes', () => {
    const original = [
      s('2026-10-01', {
        workout: 'A', length: 'Full', minutes: 35, energy: 4, easyWeek: false, notes: 'felt "strong", good day\nnew PR',
        entries: [e('gobletSquat', 25, [15, 15, 15]), e('latPulldown', 6, [12, 11, 10]), e('plank', null, [45, 40])],
      }),
      s('2026-10-03', { workout: 'B', length: 'Minimum', minutes: 10, energy: 2, easyWeek: true, notes: '', entries: [e('gobletSquat', 25, [15]), e('seatedRow', 3, [12])] }),
      s('2026-10-05', { workout: 'A', length: 'Short', minutes: null, energy: null, notes: 'no entries, just a note' }),
    ]
    const back = parseSessionsCsv(sessionsToCsv(original))
    expect(back.errors).toEqual([])
    const sortEntries = (x: NewSession) => ({ ...x, entries: [...x.entries].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)) })
    expect(back.records.map(sortEntries)).toEqual(original.map(strip).map(sortEntries))
  })

  it('Sheet import → export → import recreates the same sessions', () => {
    const first = parseSessionsCsv(sheetCsv).records
    const second = parseSessionsCsv(sessionsToCsv(withIds(first))).records
    expect(second).toHaveLength(13)
    // Only the source changes: the re-exported file is an app export.
    expect(second.map((x) => ({ ...x, source: 'sheetImport' }))).toEqual(first)
  })
})

describe('measurements and walks/yoga CSV', () => {
  it('measurements round-trip with one header row', () => {
    const original = [m('2026-10-01', { weightLb: 182.4, waistIn: 36.5, bodyFatPct: 22, notes: 'morning, fasted' }), m('2026-11-01', { waistIn: 36 })]
    const csv = measurementsToCsv(original)
    expect(parseCsv(csv)[0]).toEqual(['Date', 'Weight (lb)', 'Waist (in)', 'Body fat (%)', 'Notes'])
    const back = parseMeasurementsCsv(csv)
    expect(back.errors).toEqual([])
    expect(back.records).toEqual(original.map(strip))
  })

  it('walks and yoga round-trip with one header row', () => {
    const original = [act('2026-10-01', 'Walk', 30, 'loop'), act('2026-10-02', 'Yoga', 20), act('2026-10-03', 'Other', 15, 'bike, easy')]
    const csv = activitiesToCsv(original)
    expect(parseCsv(csv)[0]).toEqual(['Date', 'Activity', 'Minutes', 'Notes'])
    const back = parseActivitiesCsv(csv)
    expect(back.errors).toEqual([])
    expect(back.records).toEqual(original.map(strip))
  })

  it('reports bad rows', () => {
    const r = parseActivitiesCsv('Date,Activity,Minutes,Notes\n10/1/26,Swim,30,\n10/2/26,Walk,,\n10/3/26,walk,25,\n')
    expect(r.errors.map((x) => x.row)).toEqual([2, 3])
    expect(r.records).toEqual([{ date: '2026-10-03', type: 'Walk', minutes: 25, notes: '' }])
    expect(parseMeasurementsCsv('Weight (lb)\n180\n').errors[0].message).toMatch(/Date/)
    expect(parseMeasurementsCsv('Date,Weight (lb)\n10/1/26,heavy\n').errors[0].row).toBe(2)
  })
})

describe('file names', () => {
  it('names each download by kind and date', () => {
    expect(exportFileName('sessions', '2026-11-07')).toBe('workouts-sessions-2026-11-07.csv')
    expect(exportFileName('measurements', '2026-11-07')).toBe('workouts-measurements-2026-11-07.csv')
    expect(exportFileName('walks-yoga', '2026-11-07')).toBe('workouts-walks-yoga-2026-11-07.csv')
    expect(exportFileName('backup', '2026-11-07')).toBe('workouts-backup-2026-11-07.json')
  })
})
