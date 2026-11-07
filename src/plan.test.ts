import { describe, expect, it } from 'vitest'
import { EXERCISES, EXERCISE_ORDER, WORKOUTS } from './plan'

const summary = (w: 'A' | 'B') =>
  WORKOUTS[w].map((i) => {
    const e = EXERCISES[i.exerciseId]
    return `${e.name} ${i.sets}x${e.repMin}-${e.repMax} ${e.loadType}`
  })

describe('plan config matches the SPEC table', () => {
  it('workout A', () => {
    expect(summary('A')).toEqual([
      'Goblet squat 3x10-15 lb',
      'Lat pulldown 3x8-12 plate',
      'Chest press 3x10-12 plate',
      'Leg curl R 2x10-12 plate',
      'Leg curl L 2x10-12 plate',
      'Triceps pushdown 2x12-15 plate',
      'Plank / cable crunch 2x30-45 none',
    ])
  })

  it('workout B', () => {
    expect(summary('B')).toEqual([
      'Goblet squat 3x10-15 lb',
      'Seated row 3x10-12 plate',
      'Romanian deadlift 3x8-12 lb',
      'Leg extension 2x10-12 plate',
      'Lateral raise / upright row 2x10-15 plate',
      'Preacher curl 2x10-12 plate',
      'Plank / cable crunch 2x30-45 none',
    ])
  })

  it('plank is timed in seconds; everything else in reps', () => {
    for (const e of Object.values(EXERCISES)) {
      expect(e.unit).toBe(e.id === 'plank' ? 'seconds' : 'reps')
    }
  })

  it('every plan item points at a defined exercise whose id matches its key', () => {
    for (const [key, e] of Object.entries(EXERCISES)) expect(e.id).toBe(key)
    for (const id of EXERCISE_ORDER) expect(EXERCISES[id]).toBeDefined()
    expect(EXERCISE_ORDER).toHaveLength(Object.keys(EXERCISES).length)
  })
})
