import { describe, expect, it } from 'vitest'
import sheetCsv from '../../Weightlifting Tracking.csv?raw'
import { WORKOUTS } from '../plan'
import type { Measurement, SessionData } from '../types'
import { parseSessionsCsv } from './csv'
import {
  bannerDismissed,
  behindPace,
  COPY_INTRO,
  copyForClaude,
  longestMinimumRun,
  lowEnergyTwoWeeks,
  missedBumps,
  mondaysInMonth,
  monthlyReview,
  monthStats,
  showWeeklyCard,
  stalled,
  weeklyReview,
  weeklyReviewStart,
} from './reviews'
import { act, e, m, s, withIds } from './test-helpers'

const sheet = withIds(parseSessionsCsv(sheetCsv).records)
const sheetData = { sessions: sheet, measurements: [], activities: [] }

// ================================================================ behind pace

describe('behind-pace banner', () => {
  it('Monday/Tuesday with a recent session is not behind', () => {
    expect(behindPace([s('2026-11-01')], 3, '2026-11-03')).toBeNull() // Tue, 2 days since Sun
  })

  it('Wednesday or later with 0 sessions this week is behind', () => {
    expect(behindPace([s('2026-11-01', { workout: 'A' })], 3, '2026-11-04')).toEqual({ stillNeeded: 3, next: 'B' })
  })

  it('days since last ≥ 3 is behind, even early in the week', () => {
    expect(behindPace([s('2026-10-30')], 3, '2026-11-02')).toEqual({ stillNeeded: 3, next: 'A' }) // Mon, 3 days
  })

  it('no sessions ever is behind', () => {
    expect(behindPace([], 3, '2026-11-02')).toEqual({ stillNeeded: 3, next: 'A' })
  })

  it('a session this week within the last 2 days is not behind', () => {
    expect(behindPace([s('2026-11-02')], 3, '2026-11-04')).toBeNull()
    expect(behindPace([s('2026-11-02'), s('2026-11-05')], 3, '2026-11-06')).toBeNull()
  })

  it('reports still needed by Sunday', () => {
    expect(behindPace([s('2026-11-02', { workout: 'B' })], 3, '2026-11-05')).toEqual({ stillNeeded: 2, next: 'A' })
  })

  it('shows after importing the Sheet on 11/6/26 (acceptance)', () => {
    expect(behindPace(sheet, 3, '2026-11-06')).toEqual({ stillNeeded: 3, next: 'A' })
  })

  it('can be dismissed for the rest of the day', () => {
    expect(bannerDismissed('2026-11-06', '2026-11-06')).toBe(true)
    expect(bannerDismissed('2026-11-05', '2026-11-06')).toBe(false)
    expect(bannerDismissed(null, '2026-11-06')).toBe(false)
  })
})

// ================================================================ weekly review

describe('weekly review card timing', () => {
  it('shows Sunday through Tuesday only', () => {
    expect(['2026-11-08', '2026-11-09', '2026-11-10'].map(showWeeklyCard)).toEqual([true, true, true])
    expect(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map(showWeeklyCard)).toEqual([false, false, false, false])
  })

  it('covers the week ending that Sunday on Sunday, and last week on Monday/Tuesday', () => {
    expect(weeklyReviewStart('2026-11-08')).toBe('2026-11-02')
    expect(weeklyReviewStart('2026-11-09')).toBe('2026-11-02')
    expect(weeklyReviewStart('2026-11-10')).toBe('2026-11-02')
    expect(weeklyReviewStart('2026-11-07')).toBe('2026-10-26')
  })
})

describe('weekly review stats (week of Mon 10/26 – Sun 11/1)', () => {
  const lat = (load: number, sets: number[]) => e('latPulldown', load, sets)
  const sessions = [
    s('2026-10-22', { workout: 'A', length: 'Full', energy: 3, entries: [lat(5, [12, 12, 12])] }),
    s('2026-10-26', { workout: 'B', length: 'Full', energy: 4, entries: [e('gobletSquat', 25, [15, 15, 15]), e('seatedRow', 4, [12, 12, 10])] }),
    s('2026-10-28', { workout: 'A', length: 'Full', energy: 2, entries: [lat(5, [12, 12, 12])] }),
    s('2026-11-01', { workout: 'B', length: 'Minimum', entries: [e('gobletSquat', 25, [15, 15])] }),
    s('2026-11-02', { workout: 'A', length: 'Full', energy: 1, entries: [lat(5, [8, 8, 8])] }), // next week: ignored
  ]
  const activities = [act('2026-10-27', 'Walk', 30), act('2026-10-30', 'Yoga', 15), act('2026-11-02', 'Walk', 50)]
  const review = weeklyReview({ sessions, measurements: [m('2026-10-01')], activities }, '2026-10-26', 3)

  it('sessions vs target and the length mix', () => {
    expect(review).toMatchObject({ start: '2026-10-26', end: '2026-11-01', sessions: 3, target: 3 })
    expect(review.lengths).toEqual({ Full: 2, Short: 0, Minimum: 1, unknown: 0 })
  })

  it('average energy across sessions that have one', () => {
    expect(review.avgEnergy).toBe(3)
    expect(weeklyReview({ sessions: [s('2026-10-27')], measurements: [], activities: [] }, '2026-10-26', 3).avgEnergy).toBeNull()
  })

  it('walk and yoga minutes for the week', () => {
    expect([review.walkMinutes, review.yogaMinutes]).toEqual([30, 15])
  })

  it('every run of 3+ days with no session', () => {
    expect(review.gaps).toEqual([
      { from: '2026-10-22', to: '2026-10-26', days: 4 },
      { from: '2026-10-28', to: '2026-11-01', days: 4 },
    ])
  })

  it('target streak ending with the week', () => {
    expect(review.streak).toBe(1)
    expect(weeklyReview({ sessions, measurements: [], activities }, '2026-10-26', 1).streak).toBe(2)
  })

  it('exercises ready to move up, as of the end of the week', () => {
    // Goblet squat: 15/15/15 (Full) then 15/15 (Minimum, 2 planned sets) at 25 lb.
    expect(review.readyToMoveUp).toEqual([
      { exerciseId: 'gobletSquat', load: 25, hint: 'Go heavier' },
      { exerciseId: 'latPulldown', load: 5, hint: 'Move up to 6' },
    ])
  })

  it('plan exercises not logged in the last 14 days', () => {
    const logged = ['latPulldown', 'gobletSquat', 'seatedRow']
    const all = [...new Set([...WORKOUTS.A, ...WORKOUTS.B].map((i) => i.exerciseId))]
    expect(review.notLogged).toEqual(all.filter((id) => !logged.includes(id)))
  })

  it('the measurement reminder (rule 9)', () => {
    expect(review.measurementDue).toBe(true) // 10/1 is 31 days before 11/1
    expect(weeklyReview({ sessions, measurements: [m('2026-10-10')], activities }, '2026-10-26', 3).measurementDue).toBe(false)
  })
})

// ================================================================ monthly review

describe('months and weeks', () => {
  it('a week belongs to the month of its Monday', () => {
    expect(mondaysInMonth('2026-08')).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'])
    expect(mondaysInMonth('2026-06')).toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'])
  })
})

describe('monthly review for August 2026 with the imported Sheet (acceptance)', () => {
  const august = monthStats(sheetData, '2026-08', 3, '2026-11-06')

  it('shows 6 sessions', () => {
    expect(august.sessions).toBe(6)
  })

  it('weeks, sessions per week, weeks that met the target, longest gap', () => {
    expect(august.weeks).toBe(5)
    expect(august.sessionsPerWeek).toBe(1) // 5 sessions in the 5 weeks starting in August
    expect(august.weeksMetTarget).toBe(1) // week of 8/3: 8/3, 8/6, 8/8
    expect(august.longestGap).toBe(15) // 8/16 to the end of the month
  })

  it('sessions by weekday', () => {
    expect(august.byWeekday).toEqual([1, 0, 0, 2, 0, 2, 1])
  })

  it('lists lifts that were ready to move up but logged at the same load', () => {
    expect(august.missedBumps).toContainEqual({ date: '2026-08-01', exerciseId: 'legExtension', load: 6, hint: 'Move up to 7' })
    expect(august.missedBumps).toContainEqual({ date: '2026-08-01', exerciseId: 'latPulldown', load: 5, hint: 'Move up to 6' })
    expect(august.missedBumps).toContainEqual({ date: '2026-08-13', exerciseId: 'legExtension', load: 8, hint: 'Move up to 9' })
    // 8/3 leg extension went up to 7, so it's not a missed bump
    expect(august.missedBumps).not.toContainEqual(expect.objectContaining({ date: '2026-08-03', exerciseId: 'legExtension' }))
  })

  it('load at the start and end of the month', () => {
    expect(august.exercises.find((x) => x.exerciseId === 'latPulldown')).toMatchObject({ startLoad: 5, endLoad: 8, stalled: false })
    expect(august.exercises.find((x) => x.exerciseId === 'chestPress')).toMatchObject({ startLoad: 3, endLoad: 3, stalled: true })
  })
})

describe('monthly stats (October 2026)', () => {
  const sessions = [
    s('2026-09-30'),
    s('2026-10-05', { workout: 'A', length: 'Full', energy: 4, entries: [e('latPulldown', 5, [12, 12, 12])] }),
    s('2026-10-07', { workout: 'B', length: 'Minimum', energy: 2 }),
    s('2026-10-09', { workout: 'A', length: 'Full', energy: 5, entries: [e('latPulldown', 6, [10, 10, 10])] }),
    s('2026-10-31', { workout: 'B', length: 'Short', energy: 3 }),
  ]
  const measurements: Measurement[] = [
    m('2026-09-01', { weightLb: 185, waistIn: 38 }),
    m('2026-10-15', { weightLb: 182, waistIn: 37.5, bodyFatPct: 21 }),
    m('2026-11-05', { waistIn: 37 }), // after the month: ignored
  ]
  const activities = [act('2026-10-10', 'Walk', 30), act('2026-10-20', 'Walk', 20), act('2026-10-21', 'Yoga', 15), act('2026-11-01', 'Walk', 99)]
  const oct = monthStats({ sessions, measurements, activities }, '2026-10', 3, '2026-11-20')

  it('sessions per week, weeks that met the target and the longest gap', () => {
    expect(oct).toMatchObject({ sessions: 4, weeks: 4, sessionsPerWeek: 1, weeksMetTarget: 1, longestGap: 22 })
  })

  it("weeks that haven't ended yet are left out", () => {
    expect(monthStats({ sessions, measurements, activities }, '2026-10', 3, '2026-11-01').weeks).toBe(3)
  })

  it('Full/Short/Minimum mix, A/B balance and sessions by weekday', () => {
    expect(oct.lengths).toEqual({ Full: 2, Short: 1, Minimum: 1, unknown: 0 })
    expect(oct.ab).toEqual({ A: 2, B: 2, unknown: 0 })
    expect(oct.byWeekday).toEqual([1, 0, 1, 0, 1, 1, 0])
  })

  it('average energy, and Minimum days vs Full days', () => {
    expect(oct.avgEnergy).toBe(3.5)
    expect(oct.avgEnergyMinimum).toBe(2)
    expect(oct.avgEnergyFull).toBe(4.5)
  })

  it('per-exercise start and end load', () => {
    expect(oct.exercises).toEqual([{ exerciseId: 'latPulldown', startLoad: 5, endLoad: 6, stalled: false }])
  })

  it('measurement change since the first entry, and walk/yoga minutes', () => {
    expect(oct.body).toEqual({
      weightLb: { first: 185, latest: 182, change: -3 },
      waistIn: { first: 38, latest: 37.5, change: -0.5 },
      bodyFatPct: { first: 21, latest: 21, change: 0 },
    })
    expect([oct.walkMinutes, oct.yogaMinutes]).toEqual([50, 15])
  })

  it('compares with the month before, and shows steady weeks and the phase review date', () => {
    const r = monthlyReview({ sessions, measurements, activities }, '2026-10', 3, '2026-11-20')
    expect(r.current.month).toBe('2026-10')
    expect(r.previous.month).toBe('2026-09')
    expect(r.previous.sessions).toBe(1)
    expect(r.phaseReviewDate).toBe('2027-02-01')
    expect(r.steadyWeeks).toBe(0)
  })
})

describe('stalled and missed bumps', () => {
  const lat = (date: string, load: number, sets = [12, 12, 10], opts: Partial<SessionData> = {}) =>
    s(date, { workout: 'A', length: 'Full', entries: [e('latPulldown', load, sets)], ...opts })

  it('stalled when the load is unchanged across 28+ days of entries', () => {
    expect(stalled([lat('2026-10-01', 5), lat('2026-10-29', 5)], 'latPulldown', '2026-10-31')).toBe(true)
    expect(stalled([lat('2026-10-01', 5), lat('2026-10-28', 5)], 'latPulldown', '2026-10-31')).toBe(false)
    expect(stalled([lat('2026-10-01', 4), lat('2026-10-10', 5), lat('2026-10-29', 5)], 'latPulldown', '2026-10-31')).toBe(false)
    expect(stalled([lat('2026-10-01', 5)], 'latPulldown', '2026-10-31')).toBe(false)
  })

  it('easy-week entries are ignored for stalls', () => {
    expect(stalled([lat('2026-10-01', 5), lat('2026-10-15', 4, [10], { easyWeek: true }), lat('2026-10-29', 5)], 'latPulldown', '2026-10-31')).toBe(true)
  })

  it('only entries up to the end of the month count', () => {
    expect(stalled([lat('2026-10-01', 5), lat('2026-10-29', 5), lat('2026-11-02', 6)], 'latPulldown', '2026-10-31')).toBe(true)
  })

  it('missed bump: ready to move up but logged at the same load', () => {
    const top = [12, 12, 12]
    const ss = [lat('2026-10-01', 5, top), lat('2026-10-03', 5, top), lat('2026-10-05', 5, top), lat('2026-10-07', 6, top)]
    expect(missedBumps(ss, '2026-10-01', '2026-10-31')).toEqual([{ date: '2026-10-05', exerciseId: 'latPulldown', load: 5, hint: 'Move up to 6' }])
    expect(missedBumps(ss, '2026-10-06', '2026-10-31')).toEqual([])
  })
})

// ================================================================ monthly notes

describe('monthly notes (October 2026, as of 11/20)', () => {
  const notes = (sessions: SessionData[], measurements: Measurement[] = []) =>
    monthlyReview({ sessions, measurements, activities: [] }, '2026-10', 3, '2026-11-20').notes
  const MIN_NOTE = '3+ Minimum sessions in a row. Try a Short next.'
  const ENERGY_NOTE = 'Average energy under 2.5 for 2 weeks. Consider an easy week.'

  it('3+ Minimum sessions in a row', () => {
    const min = (d: string) => s(d, { length: 'Minimum' })
    expect(notes([min('2026-10-05'), min('2026-10-07'), min('2026-10-09')])).toContain(MIN_NOTE)
    const broken = [min('2026-10-05'), min('2026-10-07'), s('2026-10-09', { length: 'Short' }), min('2026-10-12')]
    expect(notes(broken)).not.toContain(MIN_NOTE)
    expect(longestMinimumRun(broken, '2026-10')).toBe(2)
  })

  it('average energy under 2.5 for the last 2 weeks of the month', () => {
    const en = (d: string, energy: 1 | 2 | 3 | 4 | 5) => s(d, { energy })
    expect(notes([en('2026-10-19', 2), en('2026-10-21', 2), en('2026-10-26', 1)])).toContain(ENERGY_NOTE)
    expect(notes([en('2026-10-19', 2), en('2026-10-21', 3), en('2026-10-26', 1)])).not.toContain(ENERGY_NOTE)
    expect(lowEnergyTwoWeeks([en('2026-10-19', 2), en('2026-10-21', 2), en('2026-10-26', 1)], '2026-10')).toBe(true)
    expect(lowEnergyTwoWeeks([en('2026-10-19', 2), en('2026-10-21', 3), en('2026-10-26', 1)], '2026-10')).toBe(false) // 2.5 is not under
    expect(lowEnergyTwoWeeks([en('2026-10-26', 1)], '2026-10')).toBe(false) // a week with no energy
  })

  it('[Exercise] stalled 4+ weeks', () => {
    const lat = (d: string) => s(d, { entries: [e('latPulldown', 5, [12, 12, 10])] })
    expect(notes([lat('2026-10-01'), lat('2026-10-29')])).toContain('Lat pulldown stalled 4+ weeks. Check form, or drop a notch and build back.')
    expect(notes([lat('2026-10-10'), lat('2026-10-29')]).join()).not.toMatch(/stalled/)
  })

  it('hit the target 4 weeks running', () => {
    const three = (monday: string) => [0, 2, 4].map((k) => s(`2026-10-${String(Number(monday.slice(8)) + k).padStart(2, '0')}`))
    const four = [...three('2026-10-05'), ...three('2026-10-12'), ...three('2026-10-19'), ...three('2026-10-26')]
    expect(notes(four)).toContain('You hit the target 4 weeks running.')
    expect(notes(four.slice(3)).join()).not.toMatch(/weeks running/)
  })

  it('waist down X in since you started', () => {
    expect(notes([], [m('2026-09-01', { waistIn: 38 }), m('2026-10-20', { waistIn: 36.5 })])).toContain('Waist down 1.5 in since you started.')
    expect(notes([], [m('2026-09-01', { waistIn: 36 }), m('2026-10-20', { waistIn: 36.5 })]).join()).not.toMatch(/Waist/)
  })

  it('easy week due (rule 8) after 6 steady weeks', () => {
    const twoPerWeek = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].flatMap((d) => [s(d), s(d.replace(/(\d\d)$/, (x) => String(Number(x) + 1).padStart(2, '0')))])
    expect(notes(twoPerWeek)).toContain('6 weeks of steady training since your last easy week. Time for an easy week.')
    expect(notes(twoPerWeek.slice(2)).join()).not.toMatch(/easy week\./)
  })

  it('no notes when nothing applies', () => {
    expect(notes([s('2026-10-05')])).toEqual([])
  })
})

// ================================================================ Copy for Claude

describe('Copy for Claude', () => {
  const review = monthlyReview(sheetData, '2026-08', 3, '2026-11-06')
  const text = copyForClaude(sheetData, review, 3)

  it('starts with one line asking for feedback, plan suggestions and motivation tips', () => {
    expect(text.split('\n')[0]).toBe(COPY_INTRO)
    expect(COPY_INTRO).toMatch(/feedback/)
    expect(COPY_INTRO).toMatch(/suggestions for the plan/)
    expect(COPY_INTRO).toMatch(/motivation tips/)
  })

  it('includes the stats next to the month before, and the notes', () => {
    expect(text).toContain('Monthly review: August 2026 (compared with July 2026)')
    expect(text).toContain('Sessions: 6 (vs 2)')
    expect(text).toContain('Weeks that met the target: 1 of 5 (vs 0 of 4)')
    expect(text).toContain('- 8/1/26 Leg extension at plate 6 (Move up to 7)')
    expect(text).toContain('- Chest press stalled 4+ weeks. Check form, or drop a notch and build back.')
  })

  it("ends with the month's sessions in the sessions-CSV layout", () => {
    const csvPart = text.slice(text.indexOf('Exercise,Goblet / bodyweight squat'))
    const rows = csvPart.split('\n')
    expect(rows.slice(0, 3).map((r) => r.split(',')[0])).toEqual(['Exercise', 'Station', 'Target'])
    expect(rows.slice(3).map((r) => r.split(',')[0])).toEqual(['8/1/26', '8/3/26', '8/6/26', '8/8/26', '8/13/26', '8/16/26'])
  })
})
