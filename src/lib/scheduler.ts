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

export function findAllSchedules(
  courseOptions: ClassSession[][][],
  prefs: UserPreferences,
  excluded: Set<string>,
  onProgress?: (n: number) => void
): ScheduleResult[] {
  const results: ScheduleResult[] = []
  const seen = new Set<string>()

  const sorted = [...courseOptions]
    .map((options, idx) => ({
      idx,
      options: [...options].sort((a, b) => {
        const ca = [...courseOptions].flat().filter(o => {
          for (const sa of a) for (const sb of o) if (sa.day === sb.day && sa.startPeriod <= sb.endPeriod && sb.startPeriod <= sa.endPeriod) return true
          return false
        }).length
        const cb = [...courseOptions].flat().filter(o => {
          for (const sa of b) for (const sb of o) if (sa.day === sb.day && sa.startPeriod <= sb.endPeriod && sb.startPeriod <= sa.endPeriod) return true
          return false
        }).length
        return ca - cb
      })
    }))
    .sort((a, b) => a.options.length - b.options.length)

  const ordered = sorted.map(s => s.options)

  let checked = 0
  const total = ordered.reduce((a, o) => a * o.length, 1)

  function scheduleKey(sessions: ClassSession[]): string {
    return sessions.map(s => `${s.courseCode}|${s.day}|${s.startPeriod}|${s.endPeriod}`).sort().join(',')
  }

  function backtrack(idx: number, current: ClassSession[]) {
    if (results.length >= 500) return
    if (++checked % 10000 === 0) onProgress?.(Math.round(checked / total * 100))
    if (idx === ordered.length) {
      const key = scheduleKey(current)
      if (seen.has(key)) return
      seen.add(key)
      const days = new Set(current.map(s => s.day))
      const daysCount = days.size
      let gaps = 0
      for (const d of days) {
        const ds = current.filter(s => s.day === d).sort((a, b) => a.startPeriod - b.startPeriod)
        for (let i = 1; i < ds.length; i++) {
          const g = ds[i].startPeriod - ds[i - 1].endPeriod
          if (g > 1) gaps += g - 1
        }
      }
      let score = 0
      if (prefs.minimizeDays) score -= daysCount * 100
      if (prefs.minimizeGaps) score -= gaps * 5
      if (prefs.preferredSlots.length > 0) {
        const prefSet = new Set(prefs.preferredSlots)
        for (const s of current) for (let p = s.startPeriod; p <= s.endPeriod; p++) if (prefSet.has(`${s.day}-${p}`)) score += 3
      }
      results.push({ sessions: [...current], score, daysCount, gaps })
      return
    }

    for (const group of ordered[idx]) {
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
      if (s.day >= 0 && s.day <= 5 && p >= 1 && p <= 12) heatmap[s.day][p - 1]++
    }
  }
  return heatmap
}
