import { describe, expect, it } from 'vitest'
import sheetCsv from '../../Weightlifting Tracking.csv?raw'
import { EXERCISES } from '../plan'
import { parseSessionsCsv } from './csv'
import { addDays } from './dates'
import {
  activityMinutes,
  buildEntries,
  daysSinceLast,
  easyLoad,
  easyWeekDue,
  gaps,
  measurementDue,
  nextWorkout,
  plannedSets,
  prefill,
  readyList,
  readyToMoveUp,
  sessionPlan,
  sessionsThisWeek,
  steadyWeeks,
  stillNeeded,
  TRAIN_LABELS,
  targetStreak,
  trainToday,
  weekStatus,
} from './rules'
import { act, e, m, s, withIds } from './test-helpers'

// Reference week: Mon 2026-11-02 … Sun 2026-11-08.

describe('rule 2: session contents', () => {
  const ids = (w: 'A' | 'B', l: 'Full' | 'Short' | 'Minimum', easy = false) =>
    sessionPlan(w, l, easy).map((i) => `${i.exerciseId}:${i.sets}`)

  it('Full = every plan item at its sets', () => {
    expect(ids('A', 'Full')).toEqual([
      'gobletSquat:3', 'latPulldown:3', 'chestPress:3', 'legCurlR:2', 'legCurlL:2', 'tricepsPushdown:2', 'plank:2',
    ])
  })

  it('Short A = goblet squat, lat pulldown, chest press at 3 sets', () => {
    expect(ids('A', 'Short')).toEqual(['gobletSquat:3', 'latPulldown:3', 'chestPress:3'])
  })

  it('Minimum B = goblet squat and seated row at 2 sets', () => {
    expect(ids('B', 'Minimum')).toEqual(['gobletSquat:2', 'seatedRow:2'])
  })

  it('easy week halves sets, rounding up', () => {
    expect(ids('A', 'Full', true)).toEqual([
      'gobletSquat:2', 'latPulldown:2', 'chestPress:2', 'legCurlR:1', 'legCurlL:1', 'tricepsPushdown:1', 'plank:1',
    ])
    expect(ids('B', 'Short', true)).toEqual(['gobletSquat:2', 'seatedRow:2', 'romanianDeadlift:2'])
    expect(ids('B', 'Minimum', true)).toEqual(['gobletSquat:1', 'seatedRow:1'])
  })

  it('easy week: plate loads one lower (not below 1), lb and bodyweight unchanged', () => {
    expect(easyLoad(EXERCISES.latPulldown, 6)).toBe(5)
    expect(easyLoad(EXERCISES.latPulldown, 1)).toBe(1)
    expect(easyLoad(EXERCISES.gobletSquat, 25)).toBe(25)
    expect(easyLoad(EXERCISES.latPulldown, null)).toBeNull()
  })

  it('planned sets: imported sessions (no length, no workout) count as Full', () => {
    expect(plannedSets(s('2026-08-01'), 'legCurlR')).toBe(2)
    expect(plannedSets(s('2026-08-01'), 'seatedRow')).toBe(3)
    expect(plannedSets(s('2026-08-01', { workout: 'A', length: 'Short' }), 'latPulldown')).toBe(3)
    expect(plannedSets(s('2026-08-01', { workout: 'B', length: 'Minimum' }), 'seatedRow')).toBe(2)
  })
})

describe('log prefill and saving', () => {
  const history = [
    s('2026-10-01', { workout: 'A', length: 'Full', entries: [e('latPulldown', 5, [12, 12, 10])] }),
    s('2026-10-05', { workout: 'A', length: 'Full', entries: [e('latPulldown', 6, [11, 10])] }),
  ]

  it("prefills last session's load and reps, repeating the last set for missing ones", () => {
    const lat = prefill('A', 'Full', false, history).find((p) => p.exerciseId === 'latPulldown')!
    expect(lat).toMatchObject({ sets: 3, load: 6, reps: [11, 10, 10] })
    expect(lat.last).toEqual(e('latPulldown', 6, [11, 10]))
  })

  it('exercises never logged prefill empty', () => {
    const chest = prefill('A', 'Full', false, history).find((p) => p.exerciseId === 'chestPress')!
    expect(chest).toMatchObject({ load: null, reps: [null, null, null], last: null })
  })

  it('easy week prefills one plate lighter and fewer sets', () => {
    const lat = prefill('A', 'Full', true, history).find((p) => p.exerciseId === 'latPulldown')!
    expect(lat).toMatchObject({ sets: 2, load: 5, reps: [11, 10] })
  })

  it('after an easy week, prefill goes back to the last normal load', () => {
    const withEasy = [...history, s('2026-10-08', { easyWeek: true, entries: [e('latPulldown', 5, [10])] })]
    const lat = prefill('A', 'Full', false, withEasy).find((p) => p.exerciseId === 'latPulldown')!
    expect(lat.load).toBe(6)
    expect(lat.last).toEqual(e('latPulldown', 5, [10]))
  })

  it('empty reps fields are not saved; an exercise with no reps is not saved', () => {
    expect(
      buildEntries([
        { exerciseId: 'latPulldown', load: 6, reps: [12, null, 10] },
        { exerciseId: 'chestPress', load: 3, reps: [null, null] },
        { exerciseId: 'plank', load: null, reps: [45, 30] },
      ]),
    ).toEqual([e('latPulldown', 6, [12, 10]), e('plank', null, [45, 30])])
  })
})

describe('rules 3 and 4: this week, still needed, days since last', () => {
  it('counts sessions from this Monday through today', () => {
    const ss = [s('2026-11-01'), s('2026-11-02'), s('2026-11-04'), s('2026-11-07')]
    expect(sessionsThisWeek(ss, '2026-11-05')).toBe(2) // Sun 11-01 is last week; 11-07 is future
    expect(sessionsThisWeek(ss, '2026-11-08')).toBe(3)
  })

  it('a Sunday-night session counts for that week, not the next Monday', () => {
    const ss = [s('2026-11-08')]
    expect(sessionsThisWeek(ss, '2026-11-08')).toBe(1)
    expect(sessionsThisWeek(ss, '2026-11-09')).toBe(0)
  })

  it('still needed never goes below 0', () => {
    expect(stillNeeded(1, 3)).toBe(2)
    expect(stillNeeded(4, 3)).toBe(0)
  })

  it('days since last', () => {
    expect(daysSinceLast([], '2026-11-06')).toBeNull()
    expect(daysSinceLast([s('2026-09-07'), s('2026-09-30')], '2026-11-06')).toBe(37)
    expect(daysSinceLast([s('2026-11-06')], '2026-11-06')).toBe(0)
  })
})

describe('rule 5: Train today?', () => {
  it('labels', () => {
    expect(TRAIN_LABELS.minimum).toBe('Yes, at least the Minimum')
    expect(TRAIN_LABELS.needed).toBe("Yes, needed to hit this week's target")
  })

  it('no sessions ever → at least the Minimum', () => {
    expect(trainToday([], 3, '2026-11-03')).toBe('minimum')
  })

  it('days since last ≥ 3 → at least the Minimum; 2 is not enough', () => {
    expect(trainToday([s('2026-10-31')], 3, '2026-11-03')).toBe('minimum') // 3 days
    expect(trainToday([s('2026-11-01')], 3, '2026-11-03')).toBe('optional') // 2 days, Tue: 3 needed < 6 left
  })

  it('still needed ≥ days left (including today) → needed', () => {
    // Saturday, 1 done this week, target 3: 2 needed, 2 days left
    expect(trainToday([s('2026-11-05')], 3, '2026-11-07')).toBe('needed')
    // Friday, 2 done: 1 needed < 3 days left
    expect(trainToday([s('2026-11-04'), s('2026-11-05')], 3, '2026-11-06')).toBe('optional')
  })

  it('already trained today → Done for today, checked before "needed"', () => {
    expect(trainToday([s('2026-11-07')], 3, '2026-11-07')).toBe('done') // Sat: still 2 needed, 2 days left
    expect(trainToday([s('2026-11-03'), s('2026-11-04'), s('2026-11-05')], 3, '2026-11-05')).toBe('done')
  })

  it('otherwise optional', () => {
    expect(trainToday([s('2026-11-02'), s('2026-11-03')], 3, '2026-11-04')).toBe('optional')
  })
})

describe('rule 6: next workout (A/B alternation)', () => {
  it('defaults to A', () => {
    expect(nextWorkout([])).toBe('A')
  })

  it('alternates from the most recent session with a workout', () => {
    expect(nextWorkout([s('2026-11-02', { workout: 'A' })])).toBe('B')
    expect(nextWorkout([s('2026-11-02', { workout: 'A' }), s('2026-11-04', { workout: 'B' })])).toBe('A')
    // order of the array doesn't matter, dates do
    expect(nextWorkout([s('2026-11-04', { workout: 'B' }), s('2026-11-02', { workout: 'A' })])).toBe('A')
  })

  it('skips sessions without a workout (imported history)', () => {
    expect(nextWorkout([s('2026-11-02', { workout: 'B' }), s('2026-11-04')])).toBe('A')
    expect(nextWorkout([s('2026-11-02'), s('2026-11-04')])).toBe('A')
  })
})

describe('rule 7: ready to move up', () => {
  const full = (date: string, load: number | null, sets: number[], ex = 'latPulldown', opts = {}) =>
    s(date, { workout: 'A', length: 'Full', entries: [e(ex, load, sets)], ...opts })

  it('every set at repMax in the last two sessions at the same load → "Move up to N+1"', () => {
    const ss = [full('2026-10-01', 5, [12, 12, 12]), full('2026-10-03', 5, [12, 12, 12])]
    expect(readyToMoveUp(ss, 'latPulldown')).toEqual({ exerciseId: 'latPulldown', load: 5, hint: 'Move up to 6' })
  })

  it('above repMax counts', () => {
    const ss = [full('2026-10-01', 5, [13, 12, 12]), full('2026-10-03', 5, [12, 14, 12])]
    expect(readyToMoveUp(ss, 'latPulldown')).not.toBeNull()
  })

  it('one set below the max → not ready', () => {
    const ss = [full('2026-10-01', 5, [12, 12, 12]), full('2026-10-03', 5, [12, 12, 11])]
    expect(readyToMoveUp(ss, 'latPulldown')).toBeNull()
  })

  it('only one session → not ready', () => {
    expect(readyToMoveUp([full('2026-10-01', 5, [12, 12, 12])], 'latPulldown')).toBeNull()
  })

  it('different loads → not ready', () => {
    const ss = [full('2026-10-01', 4, [12, 12, 12]), full('2026-10-03', 5, [12, 12, 12])]
    expect(readyToMoveUp(ss, 'latPulldown')).toBeNull()
  })

  it('fewer sets than planned → not ready', () => {
    const ss = [full('2026-10-01', 5, [12, 12, 12]), full('2026-10-03', 5, [12, 12])]
    expect(readyToMoveUp(ss, 'latPulldown')).toBeNull()
  })

  it('planned sets follow the session length (Minimum = 2 sets)', () => {
    const min = (date: string) => s(date, { workout: 'B', length: 'Minimum', entries: [e('seatedRow', 4, [12, 12])] })
    expect(readyToMoveUp([min('2026-10-01'), min('2026-10-03')], 'seatedRow')?.hint).toBe('Move up to 5')
  })

  it('only the last two entries count', () => {
    const ss = [full('2026-10-01', 5, [12, 12, 12]), full('2026-10-03', 5, [12, 12, 12]), full('2026-10-05', 5, [12, 11, 10])]
    expect(readyToMoveUp(ss, 'latPulldown')).toBeNull()
  })

  it('easy-week sessions are skipped', () => {
    const ss = [
      full('2026-10-01', 5, [12, 12, 12]),
      full('2026-10-03', 4, [10], 'latPulldown', { easyWeek: true }),
      full('2026-10-05', 5, [12, 12, 12]),
    ]
    expect(readyToMoveUp(ss, 'latPulldown')?.hint).toBe('Move up to 6')
    const easyOnly = [full('2026-10-01', 4, [12, 12], 'latPulldown', { easyWeek: true }), full('2026-10-03', 4, [12, 12], 'latPulldown', { easyWeek: true })]
    expect(readyToMoveUp(easyOnly, 'latPulldown')).toBeNull()
  })

  it('hints: "Go heavier" for lb, "Add weight" for no load', () => {
    const lb = [full('2026-10-01', 25, [15, 15, 15], 'gobletSquat'), full('2026-10-03', 25, [15, 15, 15], 'gobletSquat')]
    expect(readyToMoveUp(lb, 'gobletSquat')?.hint).toBe('Go heavier')
    const bw = [full('2026-10-01', null, [15, 15, 15], 'gobletSquat'), full('2026-10-03', null, [15, 15, 15], 'gobletSquat')]
    expect(readyToMoveUp(bw, 'gobletSquat')?.hint).toBe('Add weight')
  })

  it('plank (no load) never gets a move-up hint', () => {
    const ss = [full('2026-10-01', null, [45, 45], 'plank'), full('2026-10-03', null, [45, 45], 'plank')]
    expect(readyToMoveUp(ss, 'plank')).toBeNull()
  })

  it('readyList lists every ready exercise', () => {
    const ss = [
      s('2026-10-01', { entries: [e('latPulldown', 5, [12, 12, 12]), e('chestPress', 3, [12, 12, 12])] }),
      s('2026-10-03', { entries: [e('latPulldown', 5, [12, 12, 12]), e('chestPress', 3, [12, 12, 11])] }),
    ]
    expect(readyList(ss).map((r) => r.exerciseId)).toEqual(['latPulldown'])
  })
})

describe('rule 8: easy week due', () => {
  /** Two sessions (Mon, Wed) in each of the `n` weeks before the week of Mon 2026-11-02. */
  const weeks = (n: number, opts: (i: number) => object = () => ({})) =>
    Array.from({ length: n }, (_, k) => {
      const monday = addDays('2026-11-02', -7 * (k + 1))
      return [s(monday, opts(k + 1)), s(addDays(monday, 2))]
    }).flat()

  it('counts consecutive completed weeks with ≥ 2 sessions, ending last week', () => {
    expect(steadyWeeks(weeks(5), '2026-11-04')).toBe(5)
    expect(easyWeekDue(weeks(5), '2026-11-04')).toBe(false)
    expect(steadyWeeks(weeks(6), '2026-11-04')).toBe(6)
    expect(easyWeekDue(weeks(6), '2026-11-04')).toBe(true)
  })

  it("the current week isn't counted", () => {
    expect(steadyWeeks([...weeks(1), s('2026-11-02'), s('2026-11-03')], '2026-11-04')).toBe(1)
  })

  it('an easy-week session resets the count', () => {
    const ss = weeks(8, (i) => ({ easyWeek: i === 3 }))
    expect(steadyWeeks(ss, '2026-11-04')).toBe(2)
    expect(easyWeekDue(ss, '2026-11-04')).toBe(false)
  })

  it('a week with fewer than 2 sessions resets the count', () => {
    const ss = weeks(8).filter((x) => x.date !== '2026-10-05') // 4th week back now has one session
    expect(steadyWeeks(ss, '2026-11-04')).toBe(3)
  })

  it('no sessions → 0', () => {
    expect(steadyWeeks([], '2026-11-04')).toBe(0)
  })
})

describe('rule 9: measurement reminder', () => {
  it('no measurement → due', () => {
    expect(measurementDue([], '2026-11-06')).toBe(true)
  })

  it('28 days old is fine, 29 is due', () => {
    expect(measurementDue([m('2026-10-09')], '2026-11-06')).toBe(false) // 28 days
    expect(measurementDue([m('2026-10-08')], '2026-11-06')).toBe(true) // 29 days
  })

  it('uses the latest measurement', () => {
    expect(measurementDue([m('2026-09-01'), m('2026-11-01')], '2026-11-06')).toBe(false)
  })
})

describe('gaps of 3+ days', () => {
  it('Mon to Thu (two full days off) is a gap; Mon to Wed is not', () => {
    expect(gaps([s('2026-11-02'), s('2026-11-05')], '2026-11-02', '2026-11-08')).toEqual([
      { from: '2026-11-02', to: '2026-11-05', days: 3 },
      { from: '2026-11-05', to: null, days: 3 },
    ])
    expect(gaps([s('2026-11-02'), s('2026-11-04'), s('2026-11-06')], '2026-11-02', '2026-11-08')).toEqual([])
  })

  it('uses the last session before the range as the anchor', () => {
    expect(gaps([s('2026-10-30'), s('2026-11-03'), s('2026-11-05'), s('2026-11-07')], '2026-11-02', '2026-11-08')).toEqual([
      { from: '2026-10-30', to: '2026-11-03', days: 4 },
    ])
  })

  it('a week with no session is one open gap', () => {
    expect(gaps([s('2026-10-28')], '2026-11-02', '2026-11-08')).toEqual([{ from: '2026-10-28', to: null, days: 11 }])
    expect(gaps([], '2026-11-02', '2026-11-08')).toEqual([])
  })
})

describe('target streak and activity minutes', () => {
  it('counts weeks meeting the target back from a Monday', () => {
    const ss = [
      s('2026-10-12'), s('2026-10-14'), s('2026-10-16'), // met
      s('2026-10-19'), s('2026-10-21'), // not met
      s('2026-10-26'), s('2026-10-28'), s('2026-10-30'), // met
      s('2026-11-02'), s('2026-11-03'), s('2026-11-04'), s('2026-11-05'), // met
    ]
    expect(targetStreak(ss, 3, '2026-11-02')).toBe(2)
    expect(targetStreak(ss, 3, '2026-10-19')).toBe(0)
    expect(targetStreak(ss, 2, '2026-11-02')).toBe(4)
  })

  it('sums walk and yoga minutes in a range', () => {
    const acts = [act('2026-11-01', 'Walk', 30), act('2026-11-02', 'Walk', 20), act('2026-11-03', 'Yoga', 15), act('2026-11-03', 'Other', 40)]
    expect(activityMinutes(acts, '2026-11-02', '2026-11-08')).toEqual({ walk: 20, yoga: 15 })
  })
})

describe('dashboard after importing the Sheet CSV (acceptance)', () => {
  it('on 11/6/26: 0 of 3, 37 days since last, at least the Minimum, next A', () => {
    const sessions = withIds(parseSessionsCsv(sheetCsv).records)
    expect(weekStatus(sessions, [], 3, '2026-11-06')).toEqual({
      done: 0,
      target: 3,
      stillNeeded: 3,
      daysSinceLast: 37,
      verdict: 'minimum',
      next: 'A',
      walkMinutes: 0,
      yogaMinutes: 0,
    })
  })
})
