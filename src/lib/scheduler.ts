import { ClassSession, UserPreferences, ScheduleResult } from './types'
import { parseWeeks } from './constants'

function weeksOverlap(a: string, b: string): boolean {
  if (!a || !b) return true
  const wa = parseWeeks(a), wb = parseWeeks(b)
  return wa.some(w => wb.includes(w))
}

function sessionsOverlap(a: ClassSession, b: ClassSession, weekAware: boolean): boolean {
  if (a.day !== b.day) return false
  if (weekAware && !weeksOverlap(a.weeks, b.weeks)) return false
  return a.startPeriod <= b.endPeriod && b.startPeriod <= a.endPeriod
}

function isDayBlocked(day: number, period: number, dayOff: boolean[]): boolean {
  const isAfternoon = period >= 7
  const idx = day * 2 + (isAfternoon ? 1 : 0)
  return dayOff[idx] === true
}

function scoreSchedule(
  sessions: ClassSession[],
  prefs: UserPreferences
): { score: number; daysCount: number; gaps: number } {
  const days = new Set(sessions.map(s => s.day))
  const daysCount = days.size

  let gaps = 0
  for (const d of days) {
    const daySessions = sessions.filter(s => s.day === d).sort((a, b) => a.startPeriod - b.startPeriod)
    for (let i = 1; i < daySessions.length; i++) {
      const gap = daySessions[i].startPeriod - daySessions[i - 1].endPeriod
      if (gap > 1) gaps += gap - 1
    }
  }

  let score = 0
  if (prefs.minimizeDays) score -= daysCount * 100
  if (prefs.minimizeGaps) score -= gaps * 5

  if (prefs.preferredSlots.length > 0) {
    const prefSet = new Set(prefs.preferredSlots)
    for (const s of sessions) {
      for (let p = s.startPeriod; p <= s.endPeriod; p++) {
        if (prefSet.has(`${s.day}-${p}`)) score += 3
      }
    }
  }

  return { score, daysCount, gaps }
}

export function findAllSchedules(
  courseOptions: ClassSession[][][],
  prefs: UserPreferences,
  excluded: Set<string>
): ScheduleResult[] {
  const results: ScheduleResult[] = []
  const seen = new Set<string>()

  function scheduleKey(sessions: ClassSession[]): string {
    return sessions
      .map(s => `${s.courseCode}|${s.day}|${s.startPeriod}|${s.endPeriod}`)
      .sort()
      .join(',')
  }

  function backtrack(idx: number, current: ClassSession[]) {
    if (results.length >= 500) return
    if (idx === courseOptions.length) {
      const key = scheduleKey(current)
      if (seen.has(key)) return
      seen.add(key)
      const { score, daysCount, gaps } = scoreSchedule(current, prefs)
      results.push({ sessions: [...current], score, daysCount, gaps })
      return
    }

    for (const group of courseOptions[idx]) {
      if (excluded.has(group[0].maLop)) continue

      let blocked = false, conflict = false
      for (const session of group) {
        for (let p = session.startPeriod; p <= session.endPeriod; p++) {
          if (isDayBlocked(session.day, p, prefs.dayOff)) { blocked = true; break }
        }
        if (blocked) break
        for (const existing of current) {
          if (sessionsOverlap(session, existing, prefs.weekAware)) { conflict = true; break }
        }
        if (conflict) break
      }
      if (!blocked && !conflict) {
        current.push(...group)
        backtrack(idx + 1, current)
        for (let i = 0; i < group.length; i++) current.pop()
      }
    }
  }

  backtrack(0, [])
  return results.sort((a, b) => b.score - a.score)
}

export function buildHeatmap(sessions: ClassSession[]): number[][] {
  const heatmap: number[][] = Array.from({ length: 6 }, () => Array(12).fill(0))
  for (const s of sessions) {
    for (let p = s.startPeriod; p <= s.endPeriod; p++) {
      if (s.day >= 0 && s.day <= 5 && p >= 1 && p <= 12) {
        heatmap[s.day][p - 1]++
      }
    }
  }
  return heatmap
}
