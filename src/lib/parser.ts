import { ClassSession, Course } from './types'

const COL = {
  DEPT: 1, MA_LOP: 2, MA_LOP_KEM: 3, MA_HP: 4, TEN_HP: 5,
  TEN_HP_EN: 6, KHOI_LUONG: 7, GHI_CHU: 8, BUOI_SO: 9,
  THU: 10, THOI_GIAN: 11, BD: 12, KT: 13, KIP: 14,
  TUAN: 15, PHONG: 16, SLDK: 18, SL_MAX: 19,
  LOAI_LOP: 21, CHUONG_TRINH: 22,
}

export function parseExcelData(data: any[][]): { courses: Map<string, Course>; sessions: ClassSession[] } {
  const courses = new Map<string, Course>()
  const sessions: ClassSession[] = []

  for (let i = 3; i < data.length; i++) {
    const r = data[i]
    if (!r || !r[COL.MA_HP]) continue

    const courseCode = String(r[COL.MA_HP]).trim()
    if (!courses.has(courseCode)) {
      courses.set(courseCode, {
        code: courseCode,
        name: String(r[COL.TEN_HP] || '').trim(),
        nameEn: String(r[COL.TEN_HP_EN] || '').trim(),
        credits: String(r[COL.KHOI_LUONG] || '').trim(),
        type: String(r[COL.LOAI_LOP] || '').trim(),
      })
    }

    const dayRaw = Number(r[COL.THU])
    const day = !isNaN(dayRaw) && dayRaw >= 2 ? dayRaw - 2 : -1
    if (day < 0) continue

    const startP = Number(r[COL.BD]) || 0
    const endP = Number(r[COL.KT]) || 0
    if (startP < 1 || endP < startP) continue

    sessions.push({
      buoiSo: Number(r[COL.BUOI_SO]) || 0,
      maLop: String(r[COL.MA_LOP] || '').trim(),
      maLopKem: String(r[COL.MA_LOP_KEM] || '').trim(),
      courseCode,
      courseName: String(r[COL.TEN_HP] || '').trim(),
      department: String(r[COL.DEPT] || '').trim(),
      day,
      startPeriod: startP,
      endPeriod: endP,
      timeStr: String(r[COL.THOI_GIAN] || '').trim(),
      shift: String(r[COL.KIP] || '').trim(),
      room: String(r[COL.PHONG] || '').trim(),
      weeks: String(r[COL.TUAN] || '').trim(),
      registered: Number(r[COL.SLDK]) || 0,
      maxSlots: Number(r[COL.SL_MAX]) || 0,
      classType: String(r[COL.LOAI_LOP] || '').trim(),
      programType: String(r[COL.CHUONG_TRINH] || '').trim(),
      note: String(r[COL.GHI_CHU] || '').trim(),
    })
  }

  return { courses, sessions }
}

export function getSessionsForCourse(sessions: ClassSession[], courseCode: string): ClassSession[] {
  return sessions.filter(s => s.courseCode === courseCode)
}
