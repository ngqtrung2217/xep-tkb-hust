export interface ClassSession {
  maLop: string
  maLopKem: string
  courseCode: string
  courseName: string
  department: string
  day: number
  startPeriod: number
  endPeriod: number
  timeStr: string
  shift: string
  room: string
  weeks: string
  registered: number
  maxSlots: number
  classType: string
  programType: string
  note: string
  buoiSo: number
}

export interface Course {
  code: string
  name: string
  nameEn: string
  credits: string
  type: string
}

export interface UserPreferences {
  dayOff: boolean[]
  minimizeDays: boolean
  minimizeGaps: boolean
  preferredSlots: string[]
}

export interface ScheduleResult {
  sessions: ClassSession[]
  score: number
  daysCount: number
  gaps: number
}
