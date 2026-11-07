// Review rules from SPEC.md ("Review rules" 1–5): behind-pace banner, weekly
// review, monthly review, monthly notes and the Copy for Claude text.
import { EXERCISES, PHASE_REVIEW_DATE, WORKOUTS } from '../plan'
import type { Activity, Exercise, Length, Measurement, SessionData, WorkoutId } from '../types'
import { addDays, diffDays, monthEnd, monthLabel, monthStart, startOfWeek, toSheetDate, weekdayIndex, WEEKDAYS, addMonths } from './dates'
import { sessionsToCsv } from './csv'
import {
  activityMinutes,
  daysSinceLast,
  entriesFor,
  gaps,
  measurementDue,
  nextWorkout,
  readyList,
  readyToMoveUp,
  sessionsInRange,
  sessionsThisWeek,
  sortByDate,
  steadyWeeks,
  stillNeeded,
  targetStreak,
  type Gap,
  type MoveUp,
} from './rules'

export interface ReviewData {
  sessions: readonly SessionData[]
  measurements: readonly Measurement[]
  activities: readonly Activity[]
}

const average = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const energies = (ss: readonly SessionData[]) => ss.map((s) => s.energy).filter((e): e is NonNullable<typeof e> => e !== null)
const upTo = (ss: readonly SessionData[], date: string) => ss.filter((s) => s.date <= date)

/** Plan exercises in plan order (A, then B-only). */
const PLAN_EXERCISE_IDS = [...new Set([...WORKOUTS.A, ...WORKOUTS.B].map((i) => i.exerciseId))]

// ================================================================ 1. behind pace

export interface BehindPace {
  stillNeeded: number
  next: WorkoutId
}

/**
 * Today is Wednesday or later and the week has 0 sessions, or days since last
 * ≥ 3 (no sessions ever counts as behind). Returns null when not behind.
 */
export function behindPace(sessions: readonly SessionData[], target: number, today: string): BehindPace | null {
  const done = sessionsThisWeek(sessions, today)
  const since = daysSinceLast(sessions, today)
  const midweekEmpty = weekdayIndex(today) >= 2 && done === 0
  if (!midweekEmpty && !(since === null || since >= 3)) return null
  return { stillNeeded: stillNeeded(done, target), next: nextWorkout(sessions) }
}

/** The banner is dismissible for the rest of the day. */
export function bannerDismissed(dismissedOn: string | null, today: string): boolean {
  return dismissedOn === today
}

// ================================================================ 2. weekly review

/** Monday of the week the review card shows: this week on Sunday, last week on Monday and Tuesday. */
export function weeklyReviewStart(today: string): string {
  const monday = startOfWeek(today)
  return weekdayIndex(today) === 6 ? monday : addDays(monday, -7)
}

/** The weekly card is shown on Today from Sunday through Tuesday. */
export function showWeeklyCard(today: string): boolean {
  const d = weekdayIndex(today)
  return d === 6 || d === 0 || d === 1
}

export type LengthCounts = Record<Length | 'unknown', number>

function lengthCounts(ss: readonly SessionData[]): LengthCounts {
  const c: LengthCounts = { Full: 0, Short: 0, Minimum: 0, unknown: 0 }
  for (const s of ss) c[s.length ?? 'unknown']++
  return c
}

export const NOT_LOGGED_DAYS = 14

export interface WeeklyReview {
  start: string
  end: string
  sessions: number
  target: number
  lengths: LengthCounts
  avgEnergy: number | null
  walkMinutes: number
  yogaMinutes: number
  gaps: Gap[]
  /** Consecutive weeks meeting the target, ending with this week. */
  streak: number
  readyToMoveUp: MoveUp[]
  /** Plan exercises with no entry in the 14 days ending on `end`. */
  notLogged: string[]
  measurementDue: boolean
}

/** Weekly review for the Monday–Sunday week starting `weekStart`, as of that Sunday. */
export function weeklyReview(data: ReviewData, weekStart: string, target: number): WeeklyReview {
  const start = startOfWeek(weekStart)
  const end = addDays(start, 6)
  const week = sessionsInRange(data.sessions, start, end)
  const asOf = upTo(data.sessions, end)
  const mins = activityMinutes(data.activities, start, end)
  const recentFrom = addDays(end, -(NOT_LOGGED_DAYS - 1))
  const recent = sessionsInRange(data.sessions, recentFrom, end)
  return {
    start,
    end,
    sessions: week.length,
    target,
    lengths: lengthCounts(week),
    avgEnergy: average(energies(week)),
    walkMinutes: mins.walk,
    yogaMinutes: mins.yoga,
    gaps: gaps(data.sessions, start, end),
    streak: targetStreak(data.sessions, target, start),
    readyToMoveUp: readyList(asOf),
    notLogged: PLAN_EXERCISE_IDS.filter((id) => !recent.some((s) => s.entries.some((e) => e.exerciseId === id))),
    measurementDue: measurementDue(data.measurements.filter((m) => m.date <= end), end),
  }
}

// ================================================================ 3. monthly review

export const STALL_DAYS = 28

/**
 * Stalled: the latest load (as of `asOf`, easy-week sessions skipped) has
 * been unchanged across entries spanning 28+ days. Exercises with no load
 * (plank) are never stalled (agreed change).
 */
export function stalled(sessions: readonly SessionData[], exerciseId: string, asOf: string): boolean {
  if (EXERCISES[exerciseId]?.loadType === 'none') return false
  const list = entriesFor(upTo(sessions, asOf), exerciseId).filter((x) => !x.session.easyWeek)
  if (list.length < 2) return false
  const latest = list[list.length - 1]
  let earliest = latest
  for (let i = list.length - 2; i >= 0 && list[i].entry.load === latest.entry.load; i--) earliest = list[i]
  return diffDays(earliest.session.date, latest.session.date) >= STALL_DAYS
}

export interface MissedBump {
  date: string
  exerciseId: string
  load: number | null
  hint: string
}

/** Sessions where an exercise was ready to move up but was logged at the same load. */
export function missedBumps(sessions: readonly SessionData[], from: string, to: string): MissedBump[] {
  const sorted = sortByDate(sessions)
  const out: MissedBump[] = []
  sorted.forEach((s, i) => {
    if (s.date < from || s.date > to || s.easyWeek) return
    const before = sorted.slice(0, i)
    for (const entry of s.entries) {
      const ready = readyToMoveUp(before, entry.exerciseId)
      if (ready && ready.load === entry.load) out.push({ date: s.date, exerciseId: entry.exerciseId, load: entry.load, hint: ready.hint })
    }
  })
  return out
}

export interface ExerciseMonth {
  exerciseId: string
  startLoad: number | null
  endLoad: number | null
  stalled: boolean
}

export interface BodyChange {
  first: number
  latest: number
  change: number
}

export interface MonthStats {
  month: string // 'YYYY-MM'
  sessions: number
  /** Weeks whose Monday falls in the month and that have ended. */
  weeks: number
  sessionsPerWeek: number | null
  weeksMetTarget: number
  longestGap: number | null
  lengths: LengthCounts
  ab: Record<WorkoutId | 'unknown', number>
  byWeekday: number[] // Mon..Sun
  avgEnergy: number | null
  avgEnergyMinimum: number | null
  avgEnergyFull: number | null
  exercises: ExerciseMonth[]
  missedBumps: MissedBump[]
  body: { weightLb: BodyChange | null; waistIn: BodyChange | null; bodyFatPct: BodyChange | null }
  walkMinutes: number
  yogaMinutes: number
}

/** Mondays that fall in the month. A week belongs to the month of its Monday. */
export function mondaysInMonth(month: string): string[] {
  const first = monthStart(month)
  const last = monthEnd(month)
  let monday = startOfWeek(first)
  if (monday < first) monday = addDays(monday, 7)
  const out: string[] = []
  for (; monday <= last; monday = addDays(monday, 7)) out.push(monday)
  return out
}

function bodyChange(measurements: readonly Measurement[], asOf: string, field: 'weightLb' | 'waistIn' | 'bodyFatPct'): BodyChange | null {
  const values = sortByDate(measurements.filter((m) => m.date <= asOf && m[field] !== null))
  if (values.length === 0) return null
  const first = values[0][field] as number
  const latest = values[values.length - 1][field] as number
  return { first, latest, change: Math.round((latest - first) * 10) / 10 }
}

export function monthStats(data: ReviewData, month: string, target: number, today: string): MonthStats {
  const start = monthStart(month)
  const end = monthEnd(month)
  const inMonth = sessionsInRange(data.sessions, start, end)
  const weeks = mondaysInMonth(month).filter((m) => addDays(m, 6) < today)
  const weekCounts = weeks.map((m) => sessionsInRange(data.sessions, m, addDays(m, 6)).length)
  const gapEnd = end < today ? end : today
  const monthGaps = gaps(data.sessions, start, gapEnd)
  const exercises = PLAN_EXERCISE_IDS.flatMap((id): ExerciseMonth[] => {
    const list = inMonth.flatMap((s) => s.entries.filter((e) => e.exerciseId === id))
    if (list.length === 0) return []
    return [{ exerciseId: id, startLoad: list[0].load, endLoad: list[list.length - 1].load, stalled: stalled(data.sessions, id, end) }]
  })
  const mins = activityMinutes(data.activities, start, end)
  const byWeekday = [0, 0, 0, 0, 0, 0, 0]
  for (const s of inMonth) byWeekday[weekdayIndex(s.date)]++
  const ab = { A: 0, B: 0, unknown: 0 }
  for (const s of inMonth) ab[s.workout ?? 'unknown']++
  const anyBefore = data.sessions.some((s) => s.date <= gapEnd)
  return {
    month,
    sessions: inMonth.length,
    weeks: weeks.length,
    sessionsPerWeek: weeks.length ? weekCounts.reduce((a, b) => a + b, 0) / weeks.length : null,
    weeksMetTarget: weekCounts.filter((n) => n >= target).length,
    longestGap: anyBefore ? Math.max(0, ...monthGaps.map((g) => g.days)) : null,
    lengths: lengthCounts(inMonth),
    ab,
    byWeekday,
    avgEnergy: average(energies(inMonth)),
    avgEnergyMinimum: average(energies(inMonth.filter((s) => s.length === 'Minimum'))),
    avgEnergyFull: average(energies(inMonth.filter((s) => s.length === 'Full'))),
    exercises,
    missedBumps: missedBumps(data.sessions, start, end),
    body: {
      weightLb: bodyChange(data.measurements, end, 'weightLb'),
      waistIn: bodyChange(data.measurements, end, 'waistIn'),
      bodyFatPct: bodyChange(data.measurements, end, 'bodyFatPct'),
    },
    walkMinutes: mins.walk,
    yogaMinutes: mins.yoga,
  }
}

export interface MonthlyReview {
  current: MonthStats
  previous: MonthStats
  /** Weeks of steady training since the last easy week (as of today). */
  steadyWeeks: number
  phaseReviewDate: string
  notes: string[]
}

/** Monthly review for `month` (default UI: the last full calendar month) vs the month before. */
export function monthlyReview(data: ReviewData, month: string, target: number, today: string): MonthlyReview {
  const current = monthStats(data, month, target, today)
  const previous = monthStats(data, addMonths(month, -1), target, today)
  const steady = steadyWeeks(data.sessions, today)
  return {
    current,
    previous,
    steadyWeeks: steady,
    phaseReviewDate: PHASE_REVIEW_DATE,
    notes: monthlyNotes(data, month, target, today, current, steady),
  }
}

// ================================================================ 4. monthly notes

export const LOW_ENERGY = 2.5

/** Longest run of consecutive Minimum sessions within the month. */
export function longestMinimumRun(sessions: readonly SessionData[], month: string): number {
  let best = 0
  let run = 0
  for (const s of sessionsInRange(sessions, monthStart(month), monthEnd(month))) {
    run = s.length === 'Minimum' ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** Each of the month's last two weeks (by Monday) averages under 2.5 energy. */
export function lowEnergyTwoWeeks(sessions: readonly SessionData[], month: string): boolean {
  const mondays = mondaysInMonth(month).slice(-2)
  if (mondays.length < 2) return false
  return mondays.every((m) => {
    const avg = average(energies(sessionsInRange(sessions, m, addDays(m, 6))))
    return avg !== null && avg < LOW_ENERGY
  })
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)

export function monthlyNotes(data: ReviewData, month: string, target: number, today: string, stats: MonthStats, steady: number): string[] {
  const notes: string[] = []
  if (longestMinimumRun(data.sessions, month) >= 3) notes.push('3+ Minimum sessions in a row. Try a Short next.')
  if (lowEnergyTwoWeeks(data.sessions, month)) notes.push('Average energy under 2.5 for 2 weeks. Consider an easy week.')
  for (const e of stats.exercises) {
    if (e.stalled) notes.push(`${EXERCISES[e.exerciseId].name} stalled 4+ weeks. Check form, or drop a notch and build back.`)
  }
  const completed = mondaysInMonth(month).filter((m) => addDays(m, 6) < today)
  if (completed.length) {
    const streak = targetStreak(data.sessions, target, completed[completed.length - 1])
    if (streak >= 4) notes.push(`You hit the target ${streak} weeks running.`)
  }
  const waist = stats.body.waistIn
  if (waist && waist.change < 0) notes.push(`Waist down ${fmt(-waist.change)} in since you started.`)
  if (steady >= 6) notes.push(`${steady} weeks of steady training since your last easy week. Time for an easy week.`)
  return notes
}

// ================================================================ 5. Copy for Claude

export function formatLoad(exercise: Exercise, load: number | null): string {
  if (load === null) return 'bodyweight'
  return exercise.loadType === 'plate' ? `plate ${load}` : `${load} lb`
}

const opt = (n: number | null, digits = 1) => (n === null ? '–' : n.toFixed(digits))
const vs = (a: string, b: string) => `${a} (vs ${b})`

function bodyLine(label: string, unit: string, c: BodyChange | null): string {
  if (!c) return `${label}: no entries`
  const sign = c.change > 0 ? '+' : ''
  return `${label}: ${fmt(c.latest)}${unit} (${sign}${fmt(c.change)}${unit} since first entry of ${fmt(c.first)}${unit})`
}

export const COPY_INTRO =
  "Here is my workout tracker's monthly review. Please give me feedback on how the month went, suggestions for the plan, and motivation tips."

/** Plain-text summary for pasting into Claude. */
export function copyForClaude(data: ReviewData, review: MonthlyReview, target: number): string {
  const c = review.current
  const p = review.previous
  const lines: string[] = [
    COPY_INTRO,
    '',
    `Monthly review: ${monthLabel(c.month)} (compared with ${monthLabel(p.month)})`,
    `Weekly target: ${target} sessions`,
    `Sessions: ${vs(String(c.sessions), String(p.sessions))}`,
    `Sessions per week: ${vs(opt(c.sessionsPerWeek), opt(p.sessionsPerWeek))}`,
    `Weeks that met the target: ${vs(`${c.weeksMetTarget} of ${c.weeks}`, `${p.weeksMetTarget} of ${p.weeks}`)}`,
    `Longest gap: ${vs(c.longestGap === null ? '–' : `${c.longestGap} days`, p.longestGap === null ? '–' : `${p.longestGap} days`)}`,
    `Mix: ${vs(
      `Full ${c.lengths.Full}, Short ${c.lengths.Short}, Minimum ${c.lengths.Minimum}, not recorded ${c.lengths.unknown}`,
      `Full ${p.lengths.Full}, Short ${p.lengths.Short}, Minimum ${p.lengths.Minimum}, not recorded ${p.lengths.unknown}`,
    )}`,
    `A/B: ${vs(`A ${c.ab.A}, B ${c.ab.B}, not recorded ${c.ab.unknown}`, `A ${p.ab.A}, B ${p.ab.B}, not recorded ${p.ab.unknown}`)}`,
    `By weekday: ${WEEKDAYS.map((d, i) => `${d} ${c.byWeekday[i]}`).join(', ')}`,
    `Average energy: ${vs(opt(c.avgEnergy), opt(p.avgEnergy))}; Minimum days ${opt(c.avgEnergyMinimum)}, Full days ${opt(c.avgEnergyFull)}`,
    '',
    'Exercises (load at start → end of month):',
  ]
  if (c.exercises.length === 0) lines.push('- none logged')
  for (const e of c.exercises) {
    const ex = EXERCISES[e.exerciseId]
    const prev = p.exercises.find((x) => x.exerciseId === e.exerciseId)
    const prevText = prev ? `${formatLoad(ex, prev.startLoad)} → ${formatLoad(ex, prev.endLoad)}` : 'not logged'
    lines.push(`- ${ex.name}: ${formatLoad(ex, e.startLoad)} → ${formatLoad(ex, e.endLoad)} (vs ${prevText})${e.stalled ? ' [stalled 4+ weeks]' : ''}`)
  }
  lines.push('', 'Missed bumps (ready to move up but logged at the same load):')
  if (c.missedBumps.length === 0) lines.push('- none')
  for (const m of c.missedBumps) {
    const ex = EXERCISES[m.exerciseId]
    lines.push(`- ${toSheetDate(m.date)} ${ex.name} at ${formatLoad(ex, m.load)} (${m.hint})`)
  }
  lines.push(
    '',
    bodyLine('Weight', ' lb', c.body.weightLb),
    bodyLine('Waist', ' in', c.body.waistIn),
    bodyLine('Body fat', '%', c.body.bodyFatPct),
    `Walk minutes: ${vs(String(c.walkMinutes), String(p.walkMinutes))}`,
    `Yoga minutes: ${vs(String(c.yogaMinutes), String(p.yogaMinutes))}`,
    `Weeks of steady training since the last easy week: ${review.steadyWeeks}`,
    `Phase review date: ${review.phaseReviewDate}`,
    '',
    'Notes:',
    ...(review.notes.length ? review.notes.map((n) => `- ${n}`) : ['- none']),
    '',
    `Sessions in ${monthLabel(c.month)} (CSV, same layout as my old tracking sheet):`,
    sessionsToCsv(sessionsInRange(data.sessions, monthStart(c.month), monthEnd(c.month))).trimEnd(),
  )
  return lines.join('\n')
}
