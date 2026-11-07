// The plan config from SPEC.md ("Plan config"). Static code, not data:
// the plan is not editable in the UI.
import type { Exercise, Length, PlanItem, WorkoutId } from './types'

export const SCHEMA_VERSION = 1
export const DEFAULT_WEEKLY_TARGET = 3

// NOTE: `name` must match the header text in row 1 of the old Sheet's
// Workouts CSV, because import maps columns by that text. `station` is
// written to row 2 on export. Both are provisional until checked against
// the real CSV.
export const EXERCISES: Record<string, Exercise> = {
  gobletSquat: {
    id: 'gobletSquat',
    name: 'Goblet squat',
    station: 'kettlebell / dumbbells',
    loadType: 'lb',
    repMin: 10,
    repMax: 15,
    unit: 'reps',
  },
  latPulldown: {
    id: 'latPulldown',
    name: 'Lat pulldown',
    station: 'high pulley',
    loadType: 'plate',
    repMin: 8,
    repMax: 12,
    unit: 'reps',
  },
  chestPress: {
    id: 'chestPress',
    name: 'Chest press',
    station: 'press arms',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
  legCurlR: {
    id: 'legCurlR',
    name: 'Leg curl R',
    station: 'leg developer',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
  legCurlL: {
    id: 'legCurlL',
    name: 'Leg curl L',
    station: 'leg developer',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
  tricepsPushdown: {
    id: 'tricepsPushdown',
    name: 'Triceps pushdown',
    station: 'high pulley',
    loadType: 'plate',
    repMin: 12,
    repMax: 15,
    unit: 'reps',
  },
  plank: {
    id: 'plank',
    name: 'Plank / cable crunch',
    station: 'floor / high pulley',
    loadType: 'none',
    repMin: 30,
    repMax: 45,
    unit: 'seconds',
  },
  seatedRow: {
    id: 'seatedRow',
    name: 'Seated row',
    station: 'low pulley',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
  romanianDeadlift: {
    id: 'romanianDeadlift',
    name: 'Romanian deadlift',
    station: 'kettlebell / dumbbells',
    loadType: 'lb',
    repMin: 8,
    repMax: 12,
    unit: 'reps',
  },
  legExtension: {
    id: 'legExtension',
    name: 'Leg extension',
    station: 'leg developer',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
  lateralRaise: {
    id: 'lateralRaise',
    name: 'Lateral raise / upright row',
    station: 'low pulley',
    loadType: 'plate',
    repMin: 10,
    repMax: 15,
    unit: 'reps',
  },
  preacherCurl: {
    id: 'preacherCurl',
    name: 'Preacher curl',
    station: 'preacher curl pad',
    loadType: 'plate',
    repMin: 10,
    repMax: 12,
    unit: 'reps',
  },
}

/** Full-session items in order. Short/Minimum take the first 3/2 items. */
export const WORKOUTS: Record<WorkoutId, PlanItem[]> = {
  A: [
    { exerciseId: 'gobletSquat', sets: 3 },
    { exerciseId: 'latPulldown', sets: 3 },
    { exerciseId: 'chestPress', sets: 3 },
    { exerciseId: 'legCurlR', sets: 2 },
    { exerciseId: 'legCurlL', sets: 2 },
    { exerciseId: 'tricepsPushdown', sets: 2 },
    { exerciseId: 'plank', sets: 2 },
  ],
  B: [
    { exerciseId: 'gobletSquat', sets: 3 },
    { exerciseId: 'seatedRow', sets: 3 },
    { exerciseId: 'romanianDeadlift', sets: 3 },
    { exerciseId: 'legExtension', sets: 2 },
    { exerciseId: 'lateralRaise', sets: 2 },
    { exerciseId: 'preacherCurl', sets: 2 },
    { exerciseId: 'plank', sets: 2 },
  ],
}

/** How each length is built from the Full list (SPEC rule 2). */
export const LENGTHS: Record<Length, { approxMinutes: number; items: number | 'all'; sets: number | 'plan' }> = {
  Full: { approxMinutes: 35, items: 'all', sets: 'plan' },
  Short: { approxMinutes: 20, items: 3, sets: 3 },
  Minimum: { approxMinutes: 10, items: 2, sets: 2 },
}

/** Column order for the sessions CSV: every plan exercise once, A then B-only. */
export const EXERCISE_ORDER: string[] = [
  ...new Set([...WORKOUTS.A, ...WORKOUTS.B].map((i) => i.exerciseId)),
]

/** Shown on the monthly review. Spec says "early February 2027". */
export const PHASE_REVIEW_DATE = '2027-02-01'
