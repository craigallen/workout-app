// Data model from SPEC.md ("Data model and rules").
// Type-only import: keeps the pure lib/ modules free of runtime Firebase code.
import type { Timestamp } from 'firebase/firestore'

export type WorkoutId = 'A' | 'B'
export type Length = 'Full' | 'Short' | 'Minimum'
export type Energy = 1 | 2 | 3 | 4 | 5

export interface Exercise {
  id: string // 'gobletSquat', 'legCurlR', ...
  name: string
  station: string // 'leg developer', 'high pulley', 'kettlebell / dumbbells'
  loadType: 'plate' | 'lb' | 'none'
  repMin: number
  repMax: number
  unit: 'reps' | 'seconds'
}

/** `sets` is the set count for a Full session. */
export interface PlanItem {
  exerciseId: string
  sets: number
}

export interface Entry {
  exerciseId: string
  load: number | null // plate position or lb; null = bodyweight
  sets: number[] // reps (or seconds) per set, in order
}

export interface Session {
  id: string
  date: string // 'YYYY-MM-DD', local date
  workout: WorkoutId | null // null for imported history
  length: Length | null
  easyWeek: boolean
  minutes: number | null
  energy: Energy | null
  notes: string
  entries: Entry[]
  source: 'app' | 'sheetImport'
  createdAt: Timestamp // Firestore server timestamps
  updatedAt: Timestamp
}

export interface Measurement {
  id: string
  date: string
  weightLb: number | null
  waistIn: number | null
  bodyFatPct: number | null
  notes: string
}

export type ActivityType = 'Walk' | 'Yoga' | 'Other'

export interface Activity {
  id: string
  date: string
  type: ActivityType
  minutes: number
  notes: string
}

/** The `users/{uid}` document. */
export interface Settings {
  weeklyTarget: number
  schemaVersion: number
}
