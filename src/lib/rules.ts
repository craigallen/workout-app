// Plan rules from SPEC.md ("Rules" 1–9). Pure functions: data in, values out.
import { EXERCISES, LENGTHS, WORKOUTS } from '../plan'
import type { Activity, Entry, Exercise, Length, Measurement, PlanItem, SessionData, WorkoutId } from '../types'
import { addDays, daysLeftInWeek, diffDays, startOfWeek } from './dates'

type HasDate = { date: string }

/** Ascending by date. Stable, so same-day sessions keep their given order. */
export function sortByDate<T extends HasDate>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

const inRange = (date: string, from: string, to: string) => date >= from && date <= to

// ---------------------------------------------------------------- rule 2

/** Exercises and set counts for a session (rule 2). */
export function sessionPlan(workout: WorkoutId, length: Length, easyWeek = false): PlanItem[] {
  const full = WORKOUTS[workout]
  const spec = LENGTHS[length]
  const items = spec.items === 'all' ? full : full.slice(0, spec.items)
  return items.map((item) => {
    const sets = spec.sets === 'plan' ? item.sets : spec.sets
    return { exerciseId: item.exerciseId, sets: easyWeek ? Math.ceil(sets / 2) : sets }
  })
}

/**
 * Planned set count for an exercise in a stored session. Sessions without a
 * length (imported history) count as Full. Without a workout, the exercise's
 * Full set count from whichever workout contains it.
 */
export function plannedSets(session: Pick<SessionData, 'workout' | 'length' | 'easyWeek'>, exerciseId: string): number | null {
  const length = session.length ?? 'Full'
  const workouts: WorkoutId[] = session.workout ? [session.workout] : ['A', 'B']
  for (const w of workouts) {
    const item = sessionPlan(w, length, session.easyWeek).find((i) => i.exerciseId === exerciseId)
    if (item) return item.sets
  }
  for (const w of workouts) {
    const item = WORKOUTS[w].find((i) => i.exerciseId === exerciseId)
    if (item) return item.sets
  }
  return null
}

/** Easy-week prefill load: plate one lower (never below 1); lb and bodyweight unchanged. */
export function easyLoad(exercise: Exercise, load: number | null): number | null {
  if (load === null || exercise.loadType !== 'plate') return load
  return Math.max(1, load - 1)
}

/** Every entry for an exercise, oldest first, with its session. */
export function entriesFor(sessions: readonly SessionData[], exerciseId: string): { session: SessionData; entry: Entry }[] {
  const out: { session: SessionData; entry: Entry }[] = []
  for (const session of sortByDate(sessions)) {
    const entry = session.entries.find((e) => e.exerciseId === exerciseId)
    if (entry) out.push({ session, entry })
  }
  return out
}

export function lastEntry(sessions: readonly SessionData[], exerciseId: string): Entry | null {
  const all = entriesFor(sessions, exerciseId)
  return all.length ? all[all.length - 1].entry : null
}

export interface PrefillItem {
  exerciseId: string
  sets: number
  load: number | null
  reps: (number | null)[]
  /** The most recent entry, shown as "last time". */
  last: Entry | null
}

/**
 * Log-screen prefill. Load and reps come from the last non-easy-week entry
 * (falling back to any entry); easy week lowers plate loads by one. Reps are
 * cut to the planned set count; missing sets repeat the last logged value.
 */
export function prefill(workout: WorkoutId, length: Length, easyWeek: boolean, sessions: readonly SessionData[]): PrefillItem[] {
  return sessionPlan(workout, length, easyWeek).map(({ exerciseId, sets }) => {
    const all = entriesFor(sessions, exerciseId)
    const last = all.length ? all[all.length - 1].entry : null
    const base = [...all].reverse().find((x) => !x.session.easyWeek)?.entry ?? last
    const reps: (number | null)[] = []
    for (let i = 0; i < sets; i++) {
      const prev = base?.sets
      reps.push(prev && prev.length ? (prev[i] ?? prev[prev.length - 1]) : null)
    }
    const load = base ? base.load : null
    return { exerciseId, sets, load: easyWeek ? easyLoad(EXERCISES[exerciseId], load) : load, reps, last }
  })
}

/** Draft rows to stored entries: empty reps fields are dropped, and an exercise with no reps is not saved. */
export function buildEntries(drafts: readonly { exerciseId: string; load: number | null; reps: (number | null)[] }[]): Entry[] {
  return drafts
    .map((d) => ({ exerciseId: d.exerciseId, load: d.load, sets: d.reps.filter((r): r is number => r !== null && Number.isFinite(r)) }))
    .filter((e) => e.sets.length > 0)
}

// ---------------------------------------------------------------- rules 1, 3, 4

/** Sessions dated from this Monday through today (rule 3). */
export function sessionsThisWeek(sessions: readonly HasDate[], today: string): number {
  const from = startOfWeek(today)
  return sessions.filter((s) => inRange(s.date, from, today)).length
}

export function sessionsInRange(sessions: readonly SessionData[], from: string, to: string): SessionData[] {
  return sortByDate(sessions.filter((s) => inRange(s.date, from, to)))
}

export function stillNeeded(doneThisWeek: number, target: number): number {
  return Math.max(0, target - doneThisWeek)
}

/** Most recent session date on or before `today`, or null. */
export function lastSessionDate(sessions: readonly HasDate[], today: string): string | null {
  let last: string | null = null
  for (const s of sessions) if (s.date <= today && (last === null || s.date > last)) last = s.date
  return last
}

/** Whole days from the last session to today (rule 4); null when there are none. */
export function daysSinceLast(sessions: readonly HasDate[], today: string): number | null {
  const last = lastSessionDate(sessions, today)
  return last === null ? null : diffDays(last, today)
}

// ---------------------------------------------------------------- rule 5

export type TrainVerdict = 'done' | 'minimum' | 'needed' | 'optional'

export const TRAIN_LABELS: Record<TrainVerdict, string> = {
  done: 'Done for today',
  minimum: 'Yes, at least the Minimum',
  needed: "Yes, needed to hit this week's target",
  optional: 'Optional',
}

/** Rule 5, with "Done for today" checked first (agreed default). */
export function trainToday(sessions: readonly HasDate[], target: number, today: string): TrainVerdict {
  if (sessions.some((s) => s.date === today)) return 'done'
  const since = daysSinceLast(sessions, today)
  if (since === null || since >= 3) return 'minimum'
  if (stillNeeded(sessionsThisWeek(sessions, today), target) >= daysLeftInWeek(today)) return 'needed'
  return 'optional'
}

// ---------------------------------------------------------------- rule 6

/** Opposite of the most recent session with a workout set; default A. */
export function nextWorkout(sessions: readonly SessionData[]): WorkoutId {
  const withWorkout = sortByDate(sessions).filter((s) => s.workout !== null)
  const last = withWorkout[withWorkout.length - 1]
  return last?.workout === 'A' ? 'B' : 'A'
}

// ---------------------------------------------------------------- rule 7

export interface MoveUp {
  exerciseId: string
  load: number | null
  hint: string
}

export function moveUpHint(exercise: Exercise, load: number | null): string {
  if (load === null) return 'Add weight'
  if (exercise.loadType === 'plate') return `Move up to ${load + 1}`
  return 'Go heavier'
}

/**
 * Rule 7. Uses the exercise's last two entries across `sessions`, skipping
 * easy-week sessions. Ready when both have every set ≥ repMax, at least the
 * planned set count, and the same load. Exercises with no load (plank) never
 * get a move-up hint (agreed change).
 */
export function readyToMoveUp(sessions: readonly SessionData[], exerciseId: string): MoveUp | null {
  const exercise = EXERCISES[exerciseId]
  if (!exercise || exercise.loadType === 'none') return null
  const recent = entriesFor(sessions, exerciseId).filter((x) => !x.session.easyWeek).slice(-2)
  if (recent.length < 2) return null
  const ok = recent.every(({ session, entry }) => {
    const planned = plannedSets(session, exerciseId) ?? 1
    return entry.sets.length >= planned && entry.sets.every((r) => r >= exercise.repMax)
  })
  if (!ok || recent[0].entry.load !== recent[1].entry.load) return null
  const load = recent[1].entry.load
  return { exerciseId, load, hint: moveUpHint(exercise, load) }
}

/** Every plan exercise that is ready to move up, in plan order. */
export function readyList(sessions: readonly SessionData[]): MoveUp[] {
  return Object.keys(EXERCISES)
    .map((id) => readyToMoveUp(sessions, id))
    .filter((x): x is MoveUp => x !== null)
}

// ---------------------------------------------------------------- rule 8

/**
 * Rule 8. Counts consecutive weeks with ≥ 2 sessions, walking back from the
 * week before `today`'s week. A week containing an easy-week session stops
 * the count (and isn't counted); so does a week with fewer than 2 sessions.
 */
export function steadyWeeks(sessions: readonly SessionData[], today: string): number {
  const first = sortByDate(sessions)[0]
  if (!first) return 0
  let count = 0
  for (let monday = addDays(startOfWeek(today), -7); monday >= startOfWeek(first.date); monday = addDays(monday, -7)) {
    const week = sessions.filter((s) => inRange(s.date, monday, addDays(monday, 6)))
    if (week.some((s) => s.easyWeek) || week.length < 2) break
    count++
  }
  return count
}

export const EASY_WEEK_THRESHOLD = 6

export function easyWeekDue(sessions: readonly SessionData[], today: string): boolean {
  return steadyWeeks(sessions, today) >= EASY_WEEK_THRESHOLD
}

// ---------------------------------------------------------------- rule 9

export const MEASUREMENT_MAX_AGE_DAYS = 28

/** Rule 9: no measurement, or the latest is more than 28 days old. */
export function measurementDue(measurements: readonly Measurement[], today: string): boolean {
  const last = lastSessionDate(measurements, today)
  return last === null || diffDays(last, today) > MEASUREMENT_MAX_AGE_DAYS
}

// ---------------------------------------------------------------- shared helpers

export function activityMinutes(activities: readonly Activity[], from: string, to: string): { walk: number; yoga: number } {
  let walk = 0
  let yoga = 0
  for (const a of activities) {
    if (!inRange(a.date, from, to)) continue
    if (a.type === 'Walk') walk += a.minutes
    else if (a.type === 'Yoga') yoga += a.minutes
  }
  return { walk, yoga }
}

export interface Gap {
  /** Last session before the gap, or null when there is none. */
  from: string | null
  /** Session that ended the gap, or null when it runs to the end of the range. */
  to: string | null
  days: number
}

export const GAP_DAYS = 3

/**
 * Gaps of 3+ days (two full days off, the same test as rule 5) that end inside
 * [start, end]. Uses the last session before `start` as the anchor; a gap still
 * open at `end` is measured to `end`. With no sessions at all there is no gap.
 */
export function gaps(sessions: readonly HasDate[], start: string, end: string): Gap[] {
  const dates = [...new Set(sessions.map((s) => s.date))].filter((d) => d <= end).sort()
  if (dates.length === 0) return []
  const out: Gap[] = []
  let prev: string | null = null
  for (const d of dates) {
    if (prev !== null && d >= start && diffDays(prev, d) >= GAP_DAYS) out.push({ from: prev, to: d, days: diffDays(prev, d) })
    prev = d
  }
  if (prev !== null && diffDays(prev, end) >= GAP_DAYS) out.push({ from: prev, to: null, days: diffDays(prev, end) })
  return out
}

/** Consecutive Monday–Sunday weeks meeting the target, walking back from `lastMonday`. */
export function targetStreak(sessions: readonly HasDate[], target: number, lastMonday: string): number {
  if (target <= 0) return 0
  let count = 0
  for (let monday = lastMonday; ; monday = addDays(monday, -7)) {
    const n = sessions.filter((s) => inRange(s.date, monday, addDays(monday, 6))).length
    if (n < target) return count
    count++
  }
}

// ---------------------------------------------------------------- dashboard

export interface WeekStatus {
  done: number
  target: number
  stillNeeded: number
  daysSinceLast: number | null
  verdict: TrainVerdict
  next: WorkoutId
  walkMinutes: number
  yogaMinutes: number
}

/** The This week card (feature 2). */
export function weekStatus(sessions: readonly SessionData[], activities: readonly Activity[], target: number, today: string): WeekStatus {
  const done = sessionsThisWeek(sessions, today)
  const mins = activityMinutes(activities, startOfWeek(today), today)
  return {
    done,
    target,
    stillNeeded: stillNeeded(done, target),
    daysSinceLast: daysSinceLast(sessions, today),
    verdict: trainToday(sessions, target, today),
    next: nextWorkout(sessions),
    walkMinutes: mins.walk,
    yogaMinutes: mins.yoga,
  }
}
