'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { ClassSession, Course, UserPreferences, ScheduleResult } from '@/lib/types'
import { parseExcelData } from '@/lib/parser'
import { findAllSchedules, buildHeatmap } from '@/lib/scheduler'
import { COURSE_COLORS, DAY_LABELS, DAY_INDICES, PERIODS, PERIOD_TIME } from '@/lib/constants'
import * as XLSX from 'xlsx'
import {
  Upload, Search, Plus, X, Calendar, SlidersHorizontal,
  ChevronLeft, ChevronRight, Save, Download, Sparkles, Flame,
  CheckCircle2, Table2, ListOrdered
} from 'lucide-react'

const DAY_OFF_LABELS: [string, boolean][] = [
  ['T2 sáng', false], ['T2 chiều', true],
  ['T3 sáng', false], ['T3 chiều', true],
  ['T4 sáng', false], ['T4 chiều', true],
  ['T5 sáng', false], ['T5 chiều', true],
  ['T6 sáng', false], ['T6 chiều', true],
  ['T7 sáng', false], ['T7 chiều', true],
]

function loadJSON(key: string, fallback: any) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}

export default function Home() {
  const [data, setData] = useState<{ courses: Map<string, Course>; sessions: ClassSession[] } | null>(() => {
    const raw = loadJSON('tkb_data', null)
    if (raw) {
      const courses = new Map<string, Course>()
      for (const [k, v] of Object.entries(raw.courses)) courses.set(k, v as Course)
      return { courses, sessions: raw.sessions }
    }
    return null
  })
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() => loadJSON('tkb_selected', []))
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Course[]>([])
  const [courseColors, setCourseColors] = useState<Map<string, string>>(new Map())
  const [heatmap, setHeatmap] = useState<number[][] | null>(null)
  const [viewMode, setViewMode] = useState<'heatmap' | 'timetable'>('heatmap')
  const [scheduleResults, setScheduleResults] = useState<ScheduleResult[] | null>(null)
  const [selectedResult, setSelectedResult] = useState(0)
  const [programFilter, setProgramFilter] = useState('all')
  const [excludedSessions, setExcludedSessions] = useState<Set<string>>(() => new Set(loadJSON('tkb_excluded', [])))
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null)
  const [classFilter, setClassFilter] = useState<Map<string, string>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [brushSelect, setBrushSelect] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dayOff, setDayOff] = useState<boolean[]>(() => loadJSON('tkb_dayoff', Array(14).fill(false)))
  const [minimizeDays, setMinimizeDays] = useState(() => { try { const v = localStorage.getItem('tkb_minDays'); return v ? JSON.parse(v) : true } catch { return true } })

  useEffect(() => {
    if (data) {
      const obj: any = { courses: {}, sessions: data.sessions }
      data.courses.forEach((v, k) => { obj.courses[k] = v })
      try { localStorage.setItem('tkb_data', JSON.stringify(obj)) } catch { /* quota */ }
    } else try { localStorage.removeItem('tkb_data') } catch {}
  }, [data])
  useEffect(() => { try { localStorage.setItem('tkb_selected', JSON.stringify(selectedCodes)) } catch {} }, [selectedCodes])
  useEffect(() => { try { localStorage.setItem('tkb_excluded', JSON.stringify([...excludedSessions])) } catch {} }, [excludedSessions])
  useEffect(() => { try { localStorage.setItem('tkb_dayoff', JSON.stringify(dayOff)) } catch {} }, [dayOff])
  useEffect(() => { try { localStorage.setItem('tkb_minDays', JSON.stringify(minimizeDays)) } catch {} }, [minimizeDays])

  useEffect(() => {
    if (data && selectedCodes.length > 0) {
      const colors = new Map<string, string>()
      let ci = 0
      selectedCodes.forEach(code => { colors.set(code, COURSE_COLORS[ci++ % COURSE_COLORS.length]) })
      setCourseColors(colors)
    }
  }, [data, selectedCodes])

  const handleFile = useCallback(async (file: File) => {
    setParseError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', codepage: 65001 })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })
      if (rows.length < 5) { setParseError('File không đúng định dạng TKB HUST'); return }
      const parsed = parseExcelData(rows)
      if (parsed.courses.size === 0) { setParseError('Không tìm thấy dữ liệu lớp học'); return }
      setData(parsed)
      setScheduleResults(null)
      setSelectedCodes([])
      setExcludedSessions(new Set())
    } catch (e: any) {
      setParseError('Lỗi đọc file: ' + (e.message || ''))
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.match(/\.xlsx?$/i)) handleFile(f)
    else setParseError('Chỉ chấp nhận file .xlsx')
  }, [handleFile])

  const handleInputChange = (val: string) => {
    setInputValue(val)
    if (!data || val.length < 1) { setSuggestions([]); return }
    const matches = Array.from(data.courses.values())
      .filter(c => (c.code + c.name + c.nameEn).toLowerCase().includes(val.toLowerCase()))
      .slice(0, 10)
    setSuggestions(matches)
  }

  const addCourse = (code: string) => {
    if (!selectedCodes.includes(code)) setSelectedCodes(prev => [...prev, code])
    setInputValue(''); setSuggestions([]); setViewMode('timetable')
  }

  const removeCourse = (code: string) => {
    setSelectedCodes(prev => prev.filter(c => c !== code))
    setExcludedSessions(prev => {
      const n = new Set(prev)
      data?.sessions.filter(s => s.courseCode === code).forEach(s => n.delete(s.maLop))
      return n
    })
  }

  const visibleSessions = (() => {
    if (!data) return []
    let s = selectedCodes.length > 0
      ? data.sessions.filter(s => selectedCodes.includes(s.courseCode))
      : []
    if (programFilter !== 'all') s = s.filter(s => s.programType === programFilter)
    return s
  })()

  useEffect(() => {
    if (visibleSessions.length > 0) setHeatmap(buildHeatmap(visibleSessions))
    else setHeatmap(null)
  }, [visibleSessions.length])

  const runScheduler = () => {
    if (!data || selectedCodes.length === 0) return
    const sessionsPerCourse = selectedCodes.map(code =>
      data.sessions.filter(s => s.courseCode === code)
        .filter(s => programFilter === 'all' || s.programType === programFilter)
    )
    if (sessionsPerCourse.some(s => s.length === 0)) return
    const prefs: UserPreferences = { dayOff, minimizeDays, minimizeGaps: true }
    const results = findAllSchedules(sessionsPerCourse, prefs, excludedSessions)
    setScheduleResults(results); setSelectedResult(0)
  }

  const toggleDayOff = (idx: number) => {
    setDayOff(prev => { const n = [...prev]; n[idx] = !n[idx]; return n })
  }

  const toggleExclude = (maLop: string) => {
    setExcludedSessions(prev => { const n = new Set(prev); if (n.has(maLop)) n.delete(maLop); else n.add(maLop); return n })
  }

  const getHeatColor = (val: number, max: number): string => {
    if (max === 0 || val === 0) return '#f0fdf4'
    const r = val / max
    if (r < 0.25) return '#bbf7d0'; if (r < 0.5) return '#fde047'; if (r < 0.75) return '#fb923c'; return '#ef4444'
  }

  const maxHeat = (() => { if (!heatmap) return 0; let m = 0; for (const r of heatmap) for (const v of r) if (v > m) m = v; return m })()

  const exportICS = () => {
    if (!scheduleResults?.[selectedResult]) return
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TKB HUST//VN\n'
    for (const s of scheduleResults[selectedResult].sessions) {
      ics += 'BEGIN:VEVENT\nSUMMARY:' + s.courseCode + ' - ' + s.courseName + '\n'
      ics += 'DESCRIPTION:Lớp ' + s.maLop + ' | Phòng ' + s.room + ' | Tuần ' + s.weeks + '\nLOCATION:' + s.room + '\nEND:VEVENT\n'
    }
    ics += 'END:VCALENDAR'
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'tkb-hust.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  const saveToLocal = () => {
    const result = scheduleResults?.[selectedResult]
    if (!result) return
    const key = 'tkb_saved_' + Date.now()
    localStorage.setItem(key, JSON.stringify({ date: new Date().toISOString(), courses: selectedCodes, sessions: result.sessions }))
    setSaving(key); setTimeout(() => setSaving(null), 2000)
  }

  const currentResult = scheduleResults?.[selectedResult]

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
          <Calendar className="w-6 h-6" /> Xếp TKB HUST
        </h1>
        <div className="flex items-center gap-3">
          {!data && <span className="text-gray-400 text-sm">Upload file Excel để bắt đầu</span>}
          {data && <span className="text-green-600 flex items-center gap-1 text-sm"><CheckCircle2 className="w-4 h-4" /> Đã tải {data.sessions.length} lớp</span>}
          {data && (
            <button onClick={() => { setData(null); setSelectedCodes([]); setScheduleResults(null); setHeatmap(null); setParseError(null); localStorage.clear() }}
              className="text-red-500 hover:underline text-xs">Xoá dữ liệu</button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-96 bg-white border-r flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b"
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <div onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}>
              <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <span className="text-gray-600 font-medium">{data ? 'Nhấn để đổi file' : 'Tải lên file Excel TKB'}</span>
            </div>
            {parseError && <p className="text-red-500 text-xs mt-2">{parseError}</p>}
          </div>

          {data && <>
            <div className="px-4 py-3 border-b">
              <label className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1"><ListOrdered className="w-4 h-4" /> Chương trình</label>
              <select value={programFilter} onChange={e => setProgramFilter(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                <option value="all">Tất cả</option>
                <option value="CT CHUẨN">CT CHUẨN</option>
                <option value="ELITECH">ELITECH</option>
                <option value="SIE">SIE</option>
              </select>
            </div>

            <div className="px-4 py-3 border-b">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={inputValue} onChange={e => handleInputChange(e.target.value)}
                  placeholder="Nhập mã học phần..."
                  className="w-full border rounded-lg pl-10 pr-3 py-2 text-sm" />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                    {suggestions.map(c => (
                      <div key={c.code} onClick={() => addCourse(c.code)}
                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="font-medium text-sm">{c.code}</span>
                        <span className="text-gray-500 truncate text-sm">{c.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedCodes.length > 0 && <div className="px-4 py-3 border-b flex-1 overflow-y-auto">
              <div className="text-sm font-medium text-gray-500 mb-3">Môn đã chọn ({selectedCodes.length})</div>
              <div className="space-y-2">
                {selectedCodes.map(code => {
                  const c = data.courses.get(code)
                  const color = courseColors.get(code) || '#888'
                  const sessions = data.sessions.filter(s => s.courseCode === code)
                  const isExpanded = expandedCourse === code
                  const uniqueClasses = sessions.filter((s, i, arr) => i === arr.findIndex(x => x.maLop === s.maLop))
                  return (
                    <div key={code} className="bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                        onClick={() => setExpandedCourse(isExpanded ? null : code)}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-sm">{code}</span>
                        <span className="text-gray-500 truncate flex-1 text-sm">{c?.name}</span>
                        <span className="text-gray-400 text-xs">{uniqueClasses.length} lớp</span>
                        <button onClick={e => { e.stopPropagation(); removeCourse(code) }}
                          className="text-red-300 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                      </div>
                        {isExpanded && <div className="px-3 pb-3 space-y-1.5">
                        <div className="relative">
                          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
                          <input value={classFilter.get(code) || ''}
                            onChange={e => setClassFilter(prev => { const n = new Map(prev); n.set(code, e.target.value); return n })}
                            placeholder="Tìm mã lớp, giờ, phòng..."
                            className="w-full border rounded pl-7 pr-2 py-1 text-[11px]" />
                        </div>
                        {uniqueClasses.map(s => {
                          const isBlocked = excludedSessions.has(s.maLop)
                          const matched = currentResult?.sessions.find(x => x.maLop === s.maLop)
                          return (
                            <div key={s.maLop}
                              onClick={() => toggleExclude(s.maLop)}
                              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg cursor-pointer transition ${isBlocked ? 'bg-red-50 line-through text-red-400' : matched ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100 border border-transparent'}`}>
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isBlocked ? 'bg-red-300' : matched ? 'bg-blue-500' : 'bg-gray-300'}`} />
                              <span className="font-medium">{s.maLop}</span>
                              <span className="text-gray-500">{DAY_LABELS[s.day]} {s.timeStr}</span>
                              {s.room && <span className="text-gray-400">- {s.room}</span>}
                            </div>
                          )
                        })}
                      </div>}
                    </div>
                  )
                })}
              </div>
            </div>}

            {selectedCodes.length > 0 && <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                <SlidersHorizontal className="w-4 h-4" /> Nghỉ buổi
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DAY_OFF_LABELS.map(([label], i) => (
                  <button key={i} onClick={() => toggleDayOff(i)}
                    className={`text-xs px-2 py-1.5 rounded-lg border transition ${dayOff[i] ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>}

            {selectedCodes.length > 0 && <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Sparkles className="w-4 h-4" /> Tuỳ chọn xếp
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-1">
                <input type="checkbox" checked={minimizeDays} onChange={e => setMinimizeDays(e.target.checked)}
                  className="accent-blue-600 w-4 h-4" />
                <span>Ưu tiên xếp ít ngày nhất</span>
              </label>
            </div>}

            <div className="p-4 mt-auto">
              <button onClick={runScheduler} disabled={selectedCodes.length === 0}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-base hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition shadow-sm">
                <Sparkles className="w-5 h-5" /> Xếp thời khóa biểu
              </button>
            </div>
          </>}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b">
            <div className="flex items-center gap-2">
              {[
                { key: 'heatmap', icon: Flame, label: 'Heatmap' },
                { key: 'timetable', icon: Table2, label: 'Timetable' },
              ].map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => setViewMode(key as any)}
                  className={`text-sm px-4 py-2 rounded-lg flex items-center gap-2 transition ${viewMode === key ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {scheduleResults && <div className="flex items-center gap-3">
              <span className="text-gray-500 text-sm">{scheduleResults.length} cách xếp</span>
              <button onClick={saveToLocal}
                className="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-1.5">
                <Save className="w-4 h-4" /> {saving ? 'Đã lưu' : 'Lưu'}
              </button>
              <button onClick={exportICS}
                className="text-sm px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> ICS
              </button>
            </div>}
          </div>

          <div className="flex-1 overflow-auto p-6">
            {!data && <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Upload className="w-20 h-20 mx-auto mb-4 text-gray-300" />
                <p className="text-xl font-medium">Tải lên file Excel thời khóa biểu HUST</p>
                <p className="text-sm mt-1">Sau đó chọn môn học và xếp lịch tự động</p>
              </div>
            </div>}

            {data && viewMode === 'heatmap' && heatmap && <div>
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-medium">Heatmap số lớp mở</h3>
              </div>
              <div className="overflow-auto border rounded-xl bg-white shadow-sm">
                <table className="border-collapse w-full min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="w-20 p-2 text-xs text-gray-500 text-left font-medium">Tiết</th>
                      {DAY_LABELS.map((d, i) => (
                        <th key={i} className="text-sm p-2 text-center font-medium">
                          {d}
                          <div className="text-xs text-gray-400 font-normal">{heatmap[i]?.reduce((a, b) => a + b, 0) || 0}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(p => (
                      <tr key={p} className="hover:bg-gray-50">
                        <td className="text-xs text-gray-400 p-1 text-right pr-2 align-middle">{p}<br /><span className="text-gray-300">{PERIOD_TIME[p]}</span></td>
                        {DAY_INDICES.map(d => {
                          const val = heatmap[d]?.[p - 1] || 0
                          return (
                            <td key={d} className="border text-sm text-center p-1" style={{ backgroundColor: getHeatColor(val, maxHeat) }}>
                              {val > 0 && <span className="font-medium">{val}</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}

            {data && viewMode === 'timetable' && <div>
              <div className="flex items-center gap-2 mb-4">
                <Table2 className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-medium">{currentResult ? 'Timetable kết quả' : 'Timetable - click môn để xem lớp'}</h3>
              </div>
              <div className="overflow-auto border rounded-xl bg-white shadow-sm">
                <table className="border-collapse w-full min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="w-20 p-2 text-left text-gray-500 font-medium text-xs">Giờ</th>
                      {DAY_LABELS.map((d, i) => (
                        <th key={i} className="p-2 text-center font-medium text-sm">
                          {d}<div className="text-xs text-gray-400 font-normal">{PERIOD_TIME[1]}-{PERIOD_TIME[12]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(p => (
                      <tr key={p}>
                        <td className="text-xs text-gray-400 p-1 text-right pr-2">{p}<br />{PERIOD_TIME[p]}</td>
                        {DAY_INDICES.map(d => {
                          const s = currentResult
                            ? currentResult.sessions.find((s: ClassSession) => s.day === d && s.startPeriod <= p && s.endPeriod >= p)
                            : null
                          if (!s) return <td key={d} className="border border-gray-50" />
                          const color = courseColors.get(s.courseCode) || '#888'
                          const isFirst = s.startPeriod === p
                          return (
                            <td key={d} className="border p-1 text-center" style={{ backgroundColor: isFirst ? color + '20' : color + '08' }}>
                              {isFirst && <div className="text-xs leading-tight" style={{ color }}>
                                <div className="font-medium">{s.courseCode}</div>
                                <div className="text-gray-500 text-[10px]">{s.maLop}</div>
                                <div className="text-gray-400 text-[9px]">{s.room}</div>
                              </div>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}

            {currentResult && <div className="mt-6 bg-white rounded-xl border p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-medium flex items-center gap-2"><Calendar className="w-5 h-5" /> Kết quả xếp TKB</h3>
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedResult(Math.max(0, selectedResult - 1))}
                    disabled={selectedResult === 0}
                    className="text-sm px-3 py-1.5 bg-gray-100 rounded-lg disabled:opacity-30 hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-base font-medium">{selectedResult + 1}/{scheduleResults!.length}</span>
                  <button onClick={() => setSelectedResult(Math.min(scheduleResults!.length - 1, selectedResult + 1))}
                    disabled={selectedResult === scheduleResults!.length - 1}
                    className="text-sm px-3 py-1.5 bg-gray-100 rounded-lg disabled:opacity-30 hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="text-sm text-gray-500 mb-4">Còn <strong>{scheduleResults!.length - selectedResult - 1}</strong> cách xếp khác</div>
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-600 mb-2">Chi tiết lớp đã xếp:</h4>
                <div className="space-y-1.5">
                  {[...currentResult.sessions]
                    .sort((a: ClassSession, b: ClassSession) => a.day * 100 + a.startPeriod - (b.day * 100 + b.startPeriod))
                    .map((s: ClassSession, i: number) => {
                    const color = courseColors.get(s.courseCode) || '#888'
                    const course = data?.courses.get(s.courseCode)
                    return (
                      <div key={i} className="text-sm flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 border">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium w-20">{s.courseCode}</span>
                        <span className="text-gray-700 flex-1 truncate">{course?.name || s.courseName}</span>
                        <span className="text-gray-500 w-28 font-mono text-xs">{s.maLop}</span>
                        <span className="text-gray-400">{DAY_LABELS[s.day]} {s.timeStr}</span>
                        <span className="text-gray-400 w-20 text-right">{s.room}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>}


          </div>
        </main>
      </div>
    </div>
  )
}
