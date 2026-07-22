export const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7']
export const DAY_INDICES = [0, 1, 2, 3, 4, 5]
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export const PERIOD_TIME: Record<number, string> = {
  1: '06:45', 2: '07:30', 3: '08:15', 4: '09:20',
  5: '10:05', 6: '10:55', 7: '12:30', 8: '13:15',
  9: '14:00', 10: '15:05', 11: '15:50', 12: '16:40',
}

export const COURSE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  '#14b8a6', '#6366f1', '#d946ef', '#22c55e',
]

export const PROGRAMS = ['CT CHUẨN', 'ELITECH', 'SIE'] as const

export function parseCredits(s: string): number {
  if (!s) return 0
  const m = s.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 0
}
