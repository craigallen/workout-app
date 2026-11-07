import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysLeftInWeek,
  diffDays,
  endOfWeek,
  isISODate,
  lastFullMonth,
  monthEnd,
  monthLabel,
  parseSheetDate,
  startOfWeek,
  toISODate,
  toSheetDate,
  weekdayIndex,
} from './dates'

// Reference week: Mon 2026-11-02 … Sun 2026-11-08 (2026-11-06 is a Friday).

describe('week boundaries (Monday–Sunday, local time)', () => {
  it('Sunday 11:59pm and Monday 12:01am fall in different weeks', () => {
    const sundayNight = toISODate(new Date(2026, 10, 8, 23, 59))
    const mondayMorning = toISODate(new Date(2026, 10, 9, 0, 1))
    expect(sundayNight).toBe('2026-11-08')
    expect(mondayMorning).toBe('2026-11-09')
    expect(startOfWeek(sundayNight)).toBe('2026-11-02')
    expect(startOfWeek(mondayMorning)).toBe('2026-11-09')
  })

  it('a session logged at 11pm stays on that local day', () => {
    expect(toISODate(new Date(2026, 5, 21, 23, 0))).toBe('2026-06-21')
  })

  it('weekday, start/end of week and days left', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0) // Monday
    expect(weekdayIndex('2026-11-06')).toBe(4) // Friday
    expect(weekdayIndex('2026-11-08')).toBe(6) // Sunday
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
    expect(endOfWeek('2026-11-04')).toBe('2026-11-08')
    expect(daysLeftInWeek('2026-11-02')).toBe(7)
    expect(daysLeftInWeek('2026-11-08')).toBe(1)
  })

  it('weeks crossing a month or year boundary', () => {
    expect(startOfWeek('2026-08-01')).toBe('2026-07-27')
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
  })
})

describe('day arithmetic', () => {
  it('is unaffected by the DST change (US: 2026-11-01, 2026-03-08)', () => {
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2)
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
  })

  it('37 days from the last imported session to 11/6/26', () => {
    expect(diffDays('2026-09-30', '2026-11-06')).toBe(37)
  })

  it('handles month ends and leap years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
  })
})

describe('months', () => {
  it('last full month and month math', () => {
    expect(lastFullMonth('2026-11-06')).toBe('2026-10')
    expect(lastFullMonth('2027-01-03')).toBe('2026-12')
    expect(addMonths('2026-08', -1)).toBe('2026-07')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(monthLabel('2026-08')).toBe('August 2026')
  })
})

describe('sheet dates (m/d/yy)', () => {
  it('parses m/d/yy, m/d/yyyy and ISO', () => {
    expect(parseSheetDate('6/21/26')).toBe('2026-06-21')
    expect(parseSheetDate('11/6/2026')).toBe('2026-11-06')
    expect(parseSheetDate(' 2026-09-30 ')).toBe('2026-09-30')
  })

  it('rejects text and impossible dates', () => {
    expect(parseSheetDate('')).toBeNull()
    expect(parseSheetDate('Exercise')).toBeNull()
    expect(parseSheetDate('2/30/26')).toBeNull()
    expect(isISODate('2026-13-01')).toBe(false)
  })

  it('formats without leading zeros', () => {
    expect(toSheetDate('2026-06-21')).toBe('6/21/26')
    expect(toSheetDate('2027-01-05')).toBe('1/5/27')
  })
})
