'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import { ClassSession, Course, UserPreferences, ScheduleResult } from '@/lib/types'
import { parseExcelData } from '@/lib/parser'
import { findAllSchedules, buildHeatmap } from '@/lib/scheduler'
import { COURSE_COLORS, DAY_LABELS, DAY_INDICES, PERIODS, PERIOD_TIME, parseCredits } from '@/lib/constants'
import * as XLSX from 'xlsx'
import {
  Upload, Search, Plus, X, Calendar, SlidersHorizontal,
  ChevronLeft, ChevronRight, Save, Download, Sparkles, Flame,
  CheckCircle2, Table2, ListOrdered, CircleHelp, Eye, EyeOff, ChevronDown, Loader2, Copy, Pin, PinOff, Share2, BookOpen
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
  const [avoidedSlots, setAvoidedSlots] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dayOff, setDayOff] = useState<boolean[]>(() => loadJSON('tkb_dayoff', Array(14).fill(false)))
  const [minimizeDays, setMinimizeDays] = useState(() => { try { const v = localStorage.getItem('tkb_minDays'); return v ? JSON.parse(v) : true } catch { return true } })
  const [minimizeGaps, setMinimizeGaps] = useState(() => { try { const v = localStorage.getItem('tkb_minGaps'); return v ? JSON.parse(v) : true } catch { return true } })
  const [weekAware, setWeekAware] = useState(() => { try { const v = localStorage.getItem('tkb_weekAware'); return v ? JSON.parse(v) : true } catch { return true } })
  const [tooltip, setTooltip] = useState<string | null>(null)
  const [heatHover, setHeatHover] = useState<{ day: number; period: number; x: number; y: number } | null>(null)
  const [ttHover, setTtHover] = useState<{ sessions: ClassSession[]; x: number; y: number } | null>(null)
  const [hiddenCourses, setHiddenCourses] = useState<Set<string>>(new Set())
  const [showDayOff, setShowDayOff] = useState(true)
  const [showOptions, setShowOptions] = useState(true)
  const [scheduling, setScheduling] = useState(false)
  const [schedProgress, setSchedProgress] = useState(0)
  const [toast, setToast] = useState<{ msg: string; suggestion?: string } | null>(null)
  const [guide, setGuide] = useState(false)
  const [heatmapFilter, setHeatmapFilter] = useState('')
  const [copied, setCopied] = useState('')
  const [pinned, setPinned] = useState<Set<string>>(() => new Set(loadJSON('tkb_pinned', [])))
  const [mobileMenu, setMobileMenu] = useState(false)
  const [shareLink, setShareLink] = useState('')

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(''), 1500) })
  }

  const shareTKB = () => {
    const result = scheduleResults?.[selectedResult]
    if (!result) return
    const state = {
      c: selectedCodes,
      e: [...excludedSessions],
      d: dayOff,
      p: [...pinned],
      f: programFilter,
      md: minimizeDays,
      mg: minimizeGaps,
      w: weekAware,
      b: [...brushSelect],
      r: selectedResult,
    }
    const encoded = btoa(encodeURIComponent(JSON.stringify(state)))
    const link = window.location.origin + window.location.pathname + '?share=' + encoded
    copyText(link)
    setShareLink(link)
    setTimeout(() => setShareLink(''), 3000)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const shared = params.get('share')
    if (shared) {
      try {
        const state = JSON.parse(decodeURIComponent(atob(shared)))
        if (state.c) setSelectedCodes(state.c)
        if (state.e) setExcludedSessions(new Set(state.e))
        if (state.d) setDayOff(state.d)
        if (state.p) setPinned(new Set(state.p))
        if (state.f) setProgramFilter(state.f)
        if (state.md !== undefined) setMinimizeDays(state.md)
        if (state.mg !== undefined) setMinimizeGaps(state.mg)
        if (state.w !== undefined) setWeekAware(state.w)
        if (state.b) setBrushSelect(new Set(state.b))
        setTimeout(() => runScheduler(), 100)
      } catch {}
    }
  }, [data])

  const togglePin = (key: string) => {
    setPinned(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  useEffect(() => { try { localStorage.removeItem('tkb_results') } catch {} }, [])

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
  useEffect(() => { try { localStorage.setItem('tkb_minGaps', JSON.stringify(minimizeGaps)) } catch {} }, [minimizeGaps])
  useEffect(() => { try { localStorage.setItem('tkb_weekAware', JSON.stringify(weekAware)) } catch {} }, [weekAware])
  useEffect(() => { if (scheduleResults && pinned.size > 0) runScheduler() }, [pinned.size])
  useEffect(() => { try { localStorage.setItem('tkb_pinned', JSON.stringify([...pinned])) } catch {} }, [pinned])

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
      localStorage.removeItem('tkb_results')
      setScheduleResults(null)
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
      ? data.sessions.filter(s => selectedCodes.includes(s.courseCode) && !hiddenCourses.has(s.courseCode))
      : []
    if (programFilter !== 'all') s = s.filter(s => s.programType === programFilter)
    return s
  })()

  const heatmapSessions = heatmapFilter ? visibleSessions.filter(s => s.courseCode === heatmapFilter) : visibleSessions

  useEffect(() => {
    if (heatmapSessions.length > 0) setHeatmap(buildHeatmap(heatmapSessions))
    else setHeatmap(null)
  }, [heatmapSessions.length])

  const runScheduler = () => {
    if (!data || selectedCodes.length === 0) return
    const activeCodes = selectedCodes.filter(code => !hiddenCourses.has(code))
    if (activeCodes.length === 0) return
    setScheduling(true)
    setSchedProgress(0)
    setScheduleResults(null)

    setTimeout(() => {
      try {
      const sessionsPerCourse: ClassSession[][][] = []
    for (const code of activeCodes) {
      const all = data.sessions.filter(s => s.courseCode === code).filter(s => programFilter === 'all' || s.programType === programFilter)
      const ltPlusBt: ClassSession[][] = []

      const lt = all.filter(s => s.classType === 'LT')
      const bt = all.filter(s => s.classType === 'BT')
      const ltbt = all.filter(s => s.classType === 'LT+BT')
      const tn = all.filter(s => s.classType === 'TN')
      const other = all.filter(s => s.classType !== 'LT' && s.classType !== 'BT' && s.classType !== 'LT+BT' && s.classType !== 'TN')

      const ltByMaLop = new Map<string, ClassSession[]>()
      for (const s of lt) {
        const key = s.maLopKem && s.maLopKem !== s.maLop ? s.maLopKem : s.maLop
        if (!ltByMaLop.has(key)) ltByMaLop.set(key, [])
        ltByMaLop.get(key)!.push(s)
      }

      const btByMaLop = new Map<string, ClassSession[]>()
      for (const s of bt) {
        if (!btByMaLop.has(s.maLop)) btByMaLop.set(s.maLop, [])
        btByMaLop.get(s.maLop)!.push(s)
      }

      for (const [ltKey, ltSessions] of ltByMaLop) {
        const matchedBt = [...btByMaLop].filter(([_, sessions]) => sessions[0].maLopKem === ltKey)
        if (matchedBt.length > 0) {
          for (const [_, btSessions] of matchedBt) ltPlusBt.push([...ltSessions, ...btSessions])
        } else ltPlusBt.push(ltSessions)
      }
      for (const [_, btSessions] of btByMaLop) {
        const ltKey = btSessions[0].maLopKem
        if (ltKey && ltKey !== 'NULL' && !ltByMaLop.has(ltKey)) ltPlusBt.push(btSessions)
      }

      const tnByMaLop = new Map<string, ClassSession[]>()
      for (const s of tn) {
        if (!tnByMaLop.has(s.maLop)) tnByMaLop.set(s.maLop, [])
        tnByMaLop.get(s.maLop)!.push(s)
      }

      const ltbtByMaLop = new Map<string, ClassSession[]>()
      for (const s of ltbt) {
        if (!ltbtByMaLop.has(s.maLop)) ltbtByMaLop.set(s.maLop, [])
        ltbtByMaLop.get(s.maLop)!.push(s)
      }

      const otherByMaLop = new Map<string, ClassSession[]>()
      for (const s of other) {
        if (!otherByMaLop.has(s.maLop)) otherByMaLop.set(s.maLop, [])
        otherByMaLop.get(s.maLop)!.push(s)
      }

      const main = [...ltPlusBt, ...ltbtByMaLop.values(), ...otherByMaLop.values()]
      if (main.length > 0) sessionsPerCourse.push(main)
      const tnList = [...tnByMaLop.values()]
      if (tnList.length > 0) sessionsPerCourse.push(tnList)
    }
    if (sessionsPerCourse.some(s => s.length === 0)) {
      const emptyCourses = activeCodes.filter((code, i) => {
        const total = sessionsPerCourse.filter((_, j) => {
          const courseEntry = sessionsPerCourse[j]
          return j >= (sessionsPerCourse as any)._offset && courseEntry.some(g => g[0]?.courseCode === code)
        }).length
        return total === 0
      })
      if (emptyCourses.length > 0) {
        setToast({ msg: `Không còn lớp nào cho: ${emptyCourses.join(', ')}`, suggestion: 'Bỏ nghỉ buổi hoặc bỏ tránh giờ để có thêm lựa chọn.' })
        setTimeout(() => setToast(null), 6000)
      }
      setScheduling(false); return
    }
      const filtered = sessionsPerCourse.map(options => {
        const pinKey = options.find(g => pinned.has(g[0].maLop))
        return pinKey ? [pinKey] : options
      })
      const prefs: UserPreferences = { dayOff, minimizeDays, minimizeGaps, preferredSlots: [...brushSelect], weekAware, avoidedSlots: [...avoidedSlots] }
      const results = findAllSchedules(filtered, prefs, excludedSessions, setSchedProgress)
      if (results.length === 0) {
        const blockedDays = DAY_OFF_LABELS.filter((_, i) => dayOff[i]).map(([l]) => l)
        let suggestion = ''
        if (blockedDays.length > 0) suggestion = 'Thử bỏ nghỉ các buổi: ' + blockedDays.slice(0, 6).join(', ')
        else suggestion = 'Có thể các môn bị trùng lịch hoặc đã bị block hết lớp'
        setToast({ msg: 'Không tìm thấy cách xếp nào!', suggestion })
        setTimeout(() => setToast(null), 6000)
      } else {
        setToast(null)
      }
      setScheduleResults(results); setSelectedResult(0)
      } catch (e) { console.error(e) }
      setScheduling(false)
    }, 0)
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
      <>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 shadow-lg max-w-sm animate-slide-in">
          <div className="font-semibold text-red-700 text-sm">{toast.msg}</div>
          {toast.suggestion && <div className="text-red-600 text-xs mt-1">{toast.suggestion}</div>}
        </div>
      )}
      <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0 shadow-sm">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
          <Calendar className="w-6 h-6" /> Xếp TKB HUST
          <a href="https://github.com/ngqtrung2217/xep-tkb-hust" target="_blank" rel="noopener"
            className="text-xs font-normal text-gray-400 hover:text-blue-500 ml-1 hidden sm:inline">GitHub</a>
        </h1>
        <div className="flex items-center gap-3">
          {!data && <span className="text-gray-400 text-sm hidden sm:block">Upload file Excel để bắt đầu</span>}
          {data && <span className="text-green-600 items-center gap-1 text-sm hidden sm:flex"><CheckCircle2 className="w-4 h-4" /> Đã tải {data.sessions.length} lớp</span>}
          {data && (
            <button onClick={() => { setData(null); setSelectedCodes([]); setScheduleResults(null); setHeatmap(null); setParseError(null); localStorage.clear() }}
              className="text-red-500 hover:underline text-xs">Xoá dữ liệu</button>
          )}
          <button onClick={() => setMobileMenu(!mobileMenu)} className="sm:hidden p-2 text-gray-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button onClick={() => setGuide(true)} className="p-1.5 text-gray-400 hover:text-blue-500 transition" title="Hướng dẫn">
            <CircleHelp className="w-5 h-5" />
          </button>
        </div>
      </header>
      <div className="h-[calc(100vh-57px)] flex overflow-hidden">

        <aside className={`w-[450px] bg-white border-r flex flex-col flex-shrink-0 overflow-hidden fixed sm:relative z-40 h-[calc(100vh-57px)] transition-transform ${mobileMenu ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}`}>
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
                <option value="KSCSDT">KSCSDT</option>
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
              <textarea
                placeholder="Paste danh sách mã môn (dán từ file đk tín chỉ)..."
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2 resize-none"
                onPaste={e => {
                  const text = (e.clipboardData || (window as any).clipboardData).getData('text')
                  const codes = text.split('\n').map(line => {
                    const parts = line.trim().split('\t')
                    const raw = (parts[0] || '').trim()
                    const m = raw.match(/^[A-Za-z]{2}\d{4}[A-Za-z]?$/)
                    return m ? m[0].toUpperCase() : null
                  }).filter(Boolean) as string[]
                  if (codes.length > 0) {
                    e.preventDefault()
                    const ok: string[] = [], fail: string[] = []
                    codes.forEach(code => {
                      if (!data?.courses.has(code)) fail.push(code)
                      else if (!selectedCodes.includes(code)) { ok.push(code); addCourse(code) }
                    })
                  }
                }}
              />
            </div>

            {selectedCodes.length > 0 && <div className="px-4 py-3 overflow-y-auto sidebar-scroll flex-1">
              <div className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                <span>Môn đã chọn ({selectedCodes.length})</span>
                <span className="text-xs font-normal text-gray-400">
                  — {selectedCodes.reduce((sum, code) => sum + parseCredits(data?.courses.get(code)?.credits || ''), 0)} TC
                </span>
              </div>
              <div className="space-y-2">
                {selectedCodes.map(code => {
                  const c = data.courses.get(code)
                  const color = courseColors.get(code) || '#888'
                  const sessions = data.sessions.filter(s => s.courseCode === code)
                  const isExpanded = expandedCourse === code
                  const byKey = new Map<string, ClassSession[]>()
                  for (const s of sessions) {
                    const key = s.maLopKem && s.maLopKem !== s.maLop ? s.maLopKem : s.maLop
                    if (!byKey.has(key)) byKey.set(key, [])
                    byKey.get(key)!.push(s)
                  }
                  const uniqueClasses = [...byKey.values()]
                  return (
                    <div key={code} className="bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                        onClick={() => setExpandedCourse(isExpanded ? null : code)}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-sm">{code}</span>
                        <span className="text-gray-500 truncate flex-1 text-sm">{c?.name}</span>
                        <span className="text-gray-400 text-xs">{uniqueClasses.length} lớp</span>
                        <button onClick={e => { e.stopPropagation(); setHiddenCourses(prev => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n }) }}
                          className="text-gray-300 hover:text-gray-600 transition">
                          {hiddenCourses.has(code) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
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
                        {uniqueClasses.filter(group => {
                          const s = group[0]
                          const q = (classFilter.get(code) || '').toLowerCase()
                          if (!q) return true
                          const info = group.map(s => `${DAY_LABELS[s.day]} ${s.timeStr} ${s.room} ${s.note} ${s.programType} ${s.classType} ${s.weeks}`).join(' ').toLowerCase()
                          return s.maLop.toLowerCase().includes(q) || info.includes(q)
                        }).map(group => {
                          const s = group[0]
                          const isBlocked = excludedSessions.has(s.maLop)
                          const matched = currentResult?.sessions.find(x => x.maLop === s.maLop)
                          const info = group.map(s => `${DAY_LABELS[s.day]} ${s.timeStr}`).join(', ')
                          return (
                            <div key={s.maLop}
                              onClick={() => toggleExclude(s.maLop)}
                              className={`text-xs px-3 py-2 rounded-lg cursor-pointer transition ${isBlocked ? 'bg-red-50 line-through text-red-400' : matched ? 'bg-blue-50 border border-blue-200' : pinned.has(s.maLop) ? 'bg-yellow-50 border border-yellow-300' : 'hover:bg-gray-100 border border-transparent'}`}>
                              <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isBlocked ? 'bg-red-300' : matched ? 'bg-blue-500' : pinned.has(s.maLop) ? 'bg-yellow-500' : 'bg-gray-300'}`} />
                              <span className="font-medium text-sm">{s.maLop}</span>
                              <span className={`text-[10px] px-1 rounded font-medium flex-shrink-0 ${s.classType === 'TN' ? 'bg-purple-100 text-purple-700' : s.classType === 'BT' ? 'bg-green-100 text-green-700' : s.classType === 'LT' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{s.classType}</span>
                              <span className="text-gray-600 truncate">{info}</span>
                              {s.room && <span className="text-gray-400 flex-shrink-0">- {s.room}</span>}
                              <span className="text-gray-500 text-xs flex-shrink-0">{s.weeks}</span>
                              <Pin onClick={e => { e.stopPropagation(); togglePin(s.maLop) }} className={`w-3.5 h-3.5 cursor-pointer flex-shrink-0 ${pinned.has(s.maLop) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300 hover:text-gray-500'}`} />
                              </div>
                              {(s.note || s.programType) && <div className="flex items-center gap-2 pl-5 mt-0.5">
                                <span className="text-yellow-600 text-[10px] truncate max-w-[160px]" title={s.note}>{s.note}</span>
                                <span className="flex-1" />
                                <span className="text-gray-400 text-[10px] ml-auto">{s.programType}</span>
                              </div>}
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
              <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1 cursor-pointer select-none"
                onClick={() => setShowDayOff(!showDayOff)}>
                <SlidersHorizontal className="w-4 h-4" /> Nghỉ buổi
                <ChevronDown className={`w-4 h-4 ml-auto transition ${showDayOff ? '' : '-rotate-90'}`} />
              </div>
              {showDayOff && <div className="grid grid-cols-2 gap-1.5">
                {DAY_OFF_LABELS.map(([label], i) => (
                  <button key={i} onClick={() => toggleDayOff(i)}
                    className={`text-xs px-2 py-1.5 rounded-lg border transition ${dayOff[i] ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>}
            </div>}

            {selectedCodes.length > 0 && <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1 cursor-pointer select-none"
                onClick={() => setShowOptions(!showOptions)}>
                <Sparkles className="w-4 h-4" /> Tuỳ chọn xếp
                <ChevronDown className={`w-4 h-4 ml-auto transition ${showOptions ? '' : '-rotate-90'}`} />
              </div>
              {showOptions && <>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <input type="checkbox" checked={minimizeDays} onChange={e => setMinimizeDays(e.target.checked)}
                  className="accent-blue-600 w-4 h-4" />
                <span>Ưu tiên xếp ít ngày nhất</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox" checked={minimizeGaps} onChange={e => setMinimizeGaps(e.target.checked)}
                className="accent-blue-600 w-4 h-4" />
              <span>Ưu tiên ít cửa sổ trống</span>
              <span className="relative inline-flex">
                <CircleHelp className="w-4 h-4 text-gray-400 cursor-help"
                  onMouseEnter={() => setTooltip('gap')}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => setTooltip(tooltip === 'gap' ? null : 'gap')} />
                {tooltip === 'gap' && <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg w-64 text-left pointer-events-none leading-relaxed">
                  <strong className="block mb-1">Cửa sổ trống là gì?</strong>
                  Khoảng thời gian trống giữa 2 tiết học trong cùng một ngày.<br />
                  <em className="text-gray-300">VD:</em> Học tiết 1-2, trống tiết 3-4, học tiết 5-6 → có 2 cửa sổ trống.
                </span>}
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox" checked={weekAware} onChange={e => setWeekAware(e.target.checked)}
                className="accent-blue-600 w-4 h-4" />
              <span>Xếp chung giờ nếu khác tuần</span>
              <span className="relative inline-flex">
                <CircleHelp className="w-4 h-4 text-gray-400 cursor-help"
                  onMouseEnter={() => setTooltip('week')}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => setTooltip(tooltip === 'week' ? null : 'week')} />
                {tooltip === 'week' && <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg w-64 text-left pointer-events-none leading-relaxed">
                  Cho phép xếp 2 lớp vào cùng giờ nếu khác tuần.<br />
                  <em className="text-gray-300">VD:</em> Môn A tuần lẻ, môn B tuần chẵn → cùng tiết 3 Thứ 4.
                </span>}
              </span>
              </label>
              <div className="text-xs text-gray-400 mt-1">
                {brushSelect.size > 0 && <span className="text-blue-500">✓ Đã chọn {brushSelect.size} khung giờ yêu thích trên heatmap</span>}
              </div>
            </>}
            </div>}

            <div className="p-4 mt-auto">
              <button onClick={runScheduler} disabled={selectedCodes.length === 0 || scheduling}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-base hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition shadow-sm">
                {scheduling ? <><Loader2 className="w-5 h-5 animate-spin" /> Đang xếp... {schedProgress}%</> : <><Sparkles className="w-5 h-5" /> Xếp thời khóa biểu</>}
              </button>
            </div>
          </>}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>
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
              <button onClick={shareTKB}
                className="text-sm px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 flex items-center gap-1.5">
                {shareLink ? <CheckCircle2 className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} {shareLink ? 'Đã copy' : `#${selectedResult + 1}`}
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
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Flame className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-medium">Heatmap</h3>
                <div className="flex gap-1.5 flex-wrap ml-2">
                  <button onClick={() => setHeatmapFilter('')}
                    className={`text-xs px-2.5 py-1 rounded-full border transition ${heatmapFilter === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    Tất cả
                  </button>
                  {selectedCodes.map(code => (
                    <button key={code} onClick={() => setHeatmapFilter(heatmapFilter === code ? '' : code)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${heatmapFilter === code ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      {code}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-auto border rounded-xl bg-white shadow-sm">
                <table className="border-collapse w-full min-w-[700px] tkb-grid" style={{ tableLayout: 'fixed' }}>                  <thead>                    <tr>
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
                      <tr key={p} className={`hover:bg-gray-50 ${p === 7 ? 'afternoon-row' : ''}`}>                        <td className="text-xs text-gray-400 p-1 text-right pr-2 align-middle">{p}<br /><span className="text-gray-300">{PERIOD_TIME[p]}</span></td>
                        {DAY_INDICES.map(d => {
                          const val = heatmap[d]?.[p - 1] || 0
                          const cellCourses = visibleSessions.filter(s => s.day === d && s.startPeriod <= p && s.endPeriod >= p)
                          const unique = [...new Set(cellCourses.map(s => s.courseCode))]
                          const isHover = heatHover?.day === d && heatHover?.period === p
                          return (
                            <td key={d}
                              onMouseEnter={e => { const r = (e.target as HTMLElement).getBoundingClientRect(); setHeatHover({ day: d, period: p, x: r.left + r.width / 2, y: r.top }) }}
                              onMouseLeave={() => setHeatHover(null)}
                              onClick={() => { const key = `${d}-${p}`; setAvoidedSlots(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n }) }}
                              className="border text-sm text-center p-1 cursor-pointer relative"
                              style={{ backgroundColor: avoidedSlots.has(`${d}-${p}`) ? '#fecaca' : dayOff[d * 2 + (p >= 7 ? 1 : 0)] ? '#f3f4f6' : getHeatColor(val, maxHeat) }}>
                              {avoidedSlots.has(`${d}-${p}`) ? <span className="text-red-500 font-bold">✕</span> : dayOff[d * 2 + (p >= 7 ? 1 : 0)] ? null : val > 0 ? <span className="font-medium">{val}</span> : null}
                              {isHover && unique.length > 0 && <div className="fixed z-[9999] px-4 py-3 bg-gray-900 text-white text-sm rounded-xl shadow-2xl pointer-events-none max-w-md"
                                style={{ left: heatHover.x, top: heatHover.y, transform: 'translate(-50%, -105%)' }}>
                                <div className="font-semibold text-sm mb-1">{DAY_LABELS[d]} - Tiết {p} ({PERIOD_TIME[p]})</div>
                                <div className="text-gray-300 mb-1">Tổng số: <strong className="text-white">{val}</strong> lớp — <strong className="text-white">{unique.length}</strong> môn</div>
                                {unique.slice(0, 10).map(code => {
                                  const count = cellCourses.filter(s => s.courseCode === code).length
                                  const w = cellCourses.find(s => s.courseCode === code)?.weeks
                                  return (
                                    <div key={code} className="flex items-center gap-1.5 text-xs">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: courseColors.get(code) || '#888' }} />
                                      <span className="font-medium">{code}</span>
                                      <span className="text-gray-400">({count} lớp)</span>
                                      {w && <span className="text-gray-500">tuần {w}</span>}
                                    </div>
                                  )
                                })}
                                {unique.length > 10 && <div className="text-gray-400 text-xs mt-1">+{unique.length - 10} môn khác</div>}
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

            {data && viewMode === 'timetable' && <div>
              <div className="flex items-center gap-2 mb-4">
                <Table2 className="w-5 h-5 text-blue-500" />
                <h3 className="text-base font-medium">{currentResult ? 'Timetable kết quả' : 'Timetable - click môn để xem lớp'}</h3>
              </div>
              <div className="overflow-auto border rounded-xl bg-white shadow-sm">
                <table className="border-collapse w-full min-w-[700px] tkb-grid" style={{ tableLayout: 'fixed' }}>                  <thead>
                     <tr>
                       <th className="w-16 p-2 text-left text-gray-500 font-medium text-xs">Giờ</th>
                       {DAY_LABELS.map((d, i) => (
                         <th key={i} className="p-2 text-center font-medium text-sm">
                           {d}<div className="text-xs text-gray-400 font-normal">{PERIOD_TIME[1]}-{PERIOD_TIME[12]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(p => (
                      <tr key={p} className={p === 7 ? 'afternoon-row' : ''}>
                         <td className="text-xs text-gray-400 p-1 text-right pr-2 align-top w-16">{p}<br />{PERIOD_TIME[p]}</td>
                         {DAY_INDICES.map(d => {
                           const sessions = currentResult
                             ? currentResult.sessions.filter((s: ClassSession) => s.day === d && s.startPeriod <= p && s.endPeriod >= p)
                             : []
                            if (sessions.length === 0) {
                              const isAvd = avoidedSlots.has(`${d}-${p}`)
                              const isDayOff = dayOff[d * 2 + (p >= 7 ? 1 : 0)]
                              if (isAvd || isDayOff) return <td key={d} className="border p-0 text-center align-middle" style={{ minHeight: 52, backgroundColor: isAvd ? '#fecaca' : '#f3f4f6' }}>{isAvd ? <span className="text-red-300 text-[10px]">✕</span> : null}</td>
                              return <td key={d} className="border border-gray-50 p-0" style={{ minHeight: 52 }} />
                            }
                           const starts = sessions.filter((s: ClassSession) => s.startPeriod === p)
                           const unique = sessions.filter((s: ClassSession, i: number, arr: ClassSession[]) => i === arr.findIndex(x => x.maLop === s.maLop))
                            return (
                              <td key={d} className="border p-0.5 align-top relative" style={{ minHeight: 52 }}
                                onMouseEnter={e => {
                                  if (starts.length > 0) {
                                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                                    setTtHover({ sessions: starts, x: rect.left + rect.width / 2, y: rect.top - 8 })
                                  }
                                }}
                                 onMouseLeave={() => setTtHover(null)}>
                                 <div className="flex gap-0.5" style={{ minHeight: 48 }}>
                                 {starts.map(s => {
                                   const color = courseColors.get(s.courseCode) || '#888'
                                   return (
                                      <div key={s.maLop} className="flex-1 text-xs leading-snug rounded px-1 py-0.5 flex flex-col overflow-hidden"
                                        style={{ backgroundColor: color + '18', borderTop: `2px solid ${color}` }}>
                                        <div className="font-semibold flex justify-between items-center truncate" style={{ color }}>
                                          <span className="text-sm truncate">{s.courseCode}</span>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            <span className={`text-[10px] px-1 rounded font-medium ${s.classType === 'TN' ? 'bg-purple-100 text-purple-700' : s.classType === 'BT' ? 'bg-green-100 text-green-700' : s.classType === 'LT' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{s.classType}</span>
                                            <span className="text-gray-500 flex items-center gap-0.5 flex-shrink-0">
                                             <span className="font-normal text-xs">{s.maLop}</span>
                                             <span className="cursor-pointer hover:text-blue-500" onClick={e => { e.stopPropagation(); copyText(s.maLop) }} title="Copy">
                                               {copied === s.maLop ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                             </span>
                                             <Pin onClick={e => { e.stopPropagation(); togglePin(s.maLop) }} className={`w-3.5 h-3.5 cursor-pointer ${pinned.has(s.maLop) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300 hover:text-gray-500'}`} />
                                           </span>
                                         </div>
                                       </div>
                                        <div className="flex justify-between items-end flex-1 mt-0.5 overflow-hidden">
                                          <span className="text-gray-500 text-xs truncate min-w-0">{s.room || ''} {s.note ? <span className="text-yellow-600">({s.note})</span> : ''}</span>
                                          <span className="text-gray-600 text-[10px] flex-shrink-0 ml-1">{s.weeks}</span>
                                       </div>
                                     </div>
                                   )
                                 })}
                                 {starts.length === 0 && unique.map(s => {
                                   const color = courseColors.get(s.courseCode) || '#888'
                                   return <div key={s.maLop} className="flex-1 rounded" style={{ backgroundColor: color + '10' }} />
                                 })}
                                </div>
                                {heatHover?.day === d && heatHover?.period === p && starts.length > 0 && (
                                  <div className="fixed z-[9999] bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 bg-gray-900 text-white text-xs rounded-xl shadow-2xl pointer-events-none max-w-sm">
                                    {starts.map(s => {
                                      const c = courseColors.get(s.courseCode) || '#888'
                                      return (
                                        <div key={s.maLop} className="flex items-center gap-2 mb-1 last:mb-0">
                                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                                          <span className="font-semibold">{s.courseCode}</span>
                                          <span className="text-gray-400">{s.maLop}</span>
                                          <span className="text-gray-400">{s.room}</span>
                                          <span className="text-gray-500">tuần {s.weeks}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
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
              {scheduleResults && <div className="mt-3">
                <div className="space-y-1.5">
                  {[...currentResult.sessions]
                    .sort((a: ClassSession, b: ClassSession) => a.day * 100 + a.startPeriod - (b.day * 100 + b.startPeriod))
                    .map((s: ClassSession, i: number) => {
                    const color = courseColors.get(s.courseCode) || '#888'
                    const course = data?.courses.get(s.courseCode)
                    return (
                      <div key={i} className="text-sm bg-gray-50 rounded-lg px-3 py-2 border flex items-center gap-x-3 gap-y-1 flex-wrap">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-medium text-sm" style={{ color }}>{s.courseCode}</span>
                        <span className="font-mono text-xs text-gray-600 cursor-pointer hover:text-blue-600 flex-shrink-0"
                          onClick={() => copyText(s.maLop)} title="Copy">{copied === s.maLop ? '✓' : s.maLop} <span className="text-gray-400">{s.classType}</span></span>
                        <span className="text-gray-700 flex-1 min-w-0">{course?.name || s.courseName}</span>
                        <span className="text-gray-500 flex-shrink-0">{DAY_LABELS[s.day]} {s.timeStr}</span>
                        <span className="text-gray-500 flex-shrink-0">{s.room}</span>
                        {s.note && <span className="text-yellow-600 text-xs flex-shrink-0 truncate max-w-[100px]" title={s.note}>({s.note})</span>}
                        <span className="text-gray-600 font-medium flex-shrink-0">tuần {s.weeks}</span>
                      </div>
                    )
                  })}
                </div>
              </div>}
            </div>}


          </div>
        </main>
      </div>
      </div>
      {mobileMenu && <div className="fixed inset-0 bg-black/30 z-30 sm:hidden" onClick={() => setMobileMenu(false)} />}
      {ttHover && (
        <div className="fixed z-[9999] pointer-events-none" style={{ left: ttHover.x, top: ttHover.y, transform: 'translate(-50%, -100%)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-xl shadow-2xl px-3 py-2 space-y-2">
            {ttHover.sessions.map(s => {
              const c = courseColors.get(s.courseCode) || '#888'
              const course = data?.courses.get(s.courseCode)
              return (
                <div key={s.maLop} className="space-y-0.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                    <span style={{ color: c }}>{s.courseCode}</span>
                    <span className="text-gray-300 font-normal">{s.maLop}</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${s.classType === 'TN' ? 'bg-purple-800 text-purple-200' : s.classType === 'BT' ? 'bg-green-800 text-green-200' : s.classType === 'LT' ? 'bg-blue-800 text-blue-200' : 'bg-gray-700 text-gray-300'}`}>{s.classType}</span>
                  </div>
                  <div className="text-gray-300 ml-5">{course?.name || s.courseName}</div>
                  <div className="text-gray-400 ml-5 flex gap-3">
                    <span>{DAY_LABELS[s.day]} {s.timeStr}</span>
                    <span>{s.room}</span>
                    <span>tuần {s.weeks}</span>
                    {s.note && <span className="text-yellow-300">({s.note})</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {guide && (
        <div className="fixed inset-0 z-[99999] bg-black/40 flex items-center justify-center p-4" onClick={() => setGuide(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><BookOpen className="w-5 h-5" /> Hướng dẫn</h2>
              <button onClick={() => setGuide(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3 text-sm text-gray-600 leading-relaxed">
              <div><strong className="text-gray-800">1. Upload file</strong><br />Tải file Excel TKB từ thông báo đăng ký tín chỉ HUST. Kéo thả hoặc click để chọn.</div>
              <div><strong className="text-gray-800">2. Chọn môn</strong><br />Gõ mã HP để tìm, hoặc paste danh sách. Click môn để xem từng lớp. (eye) để ẩn, (pin) để ghim.</div>
              <div><strong className="text-gray-800">3. Nghỉ buổi / Tránh giờ</strong><br />Bật nghỉ buổi (sáng/chiều). Trên heatmap click ô - (x) tránh giờ đó. Scheduler sẽ bỏ qua.</div>
              <div><strong className="text-gray-800">4. Heatmap</strong><br />Mật độ lớp mở theo khung giờ. Hover xem chi tiết môn. Click pill để lọc theo môn.</div>
              <div><strong className="text-gray-800">5. Tuỳ chọn xếp</strong><br />Ít ngày, ít cửa sổ trống, xếp chung giờ nếu khác tuần.</div>
              <div><strong className="text-gray-800">6. Ghim lớp (pin)</strong><br />Ghim - khi xếp lại lớp đó giữ nguyên. Block lớp (click) - gạch ngang, ko xếp.</div>
              <div><strong className="text-gray-800">7. Kết quả</strong><br />Duyệt các cách xếp. Copy mã lớp. Share để gửi bạn bè.</div>
              <div><strong className="text-gray-800">8. Export ICS</strong><br />Xuất file .ics import vào Google Calendar.</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
