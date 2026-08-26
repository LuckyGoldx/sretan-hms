import { useState, useEffect, useRef } from 'react'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import { printLabReport } from '../utils/labPrint'
import {
  FlaskConical, Search, Loader2, CheckCircle, XCircle, AlertTriangle, Plus, X, FileText, Clock, Copy, Printer, Shield
} from 'lucide-react'

const PER_PAGE = 15

const LAB_UNITS = [
  'g/L', 'g/dL', 'mg/dL', 'mg/L', 'mg/mL', 'mg/g', 'ng/mL', 'ng/dL', 'ng/L', 'pg/mL', 'pg/dL', 'pg/g',
  'µg/L', 'µg/dL', 'µg/mL', 'µg/g', 'µg/kg', 'µmol/L', 'µmol/dL', 'mmol/L', 'mmol/dL', 'nmol/L', 'nmol/dL', 'pmol/L', 'fmol/L',
  'mEq/L', 'mEq/dL', 'mEq/mL', 'mmol/kg', 'mmol/g', 'nmol/g', 'µmol/g', 'osm/L', 'mOsm/L',
  'IU/L', 'mIU/L', 'mIU/dL', 'uIU/mL', 'µU/mL', 'IU/mL', 'IU/dL', 'U/L', 'mU/L', 'mU/dL', 'U/mL', 'kU/L', 'U/dL',
  '%', 'ratio', 'ratio:1', 'index', 'U', 'mU', 'IU', 'uIU',
  'cells/µL', 'cells/mm³', '/µL', '/mm³', '×10³/µL', '×10⁹/L', '×10⁶/µL', '×10¹²/L', '×10³/mm³',
  'µL', 'mL', 'dL', 'L', 'mL/min', 'mL/hr', 'L/min', 'L/hr', 'mL/24h',
  'mm', 'cm', 'cm²', 'µm', 'nm', 'mm/hr', 'mm/min', 'mmHg', 'cmH2O', 'kPa', 'Pa', 'mmHg/s',
  'fL', 'pg', 'fl', 'min', 'hr', 'hrs', 'sec', 'days', 'weeks',
  'µmol/mol', 'mmol/mol', 'mol', 'mM', 'µM',
  'mg/24h', 'g/24h', 'mmol/24h', 'µmol/24h', 'mEq/24h', 'g/mol', 'kDa', 'Da',
  'mg/kg', 'µg/kg', 'mg/m³', 'µg/m³', 'ppm', 'ppb',
  'CFU/mL', 'CFU/g', 'copies/mL', 'copies/µL', 'log10 copies/mL', 'titer', 'AU/mL',
  'µmol/min', 'nmol/min', 'U/24h',
  'pH', 'ng/g', 'µg/mg',
  'Score', 'Negative', 'Positive', 'Nil', 'None', 'Not done',
]

function ThemedCombobox({ value, onChange, onCommit, options, placeholder, keepValue }: {
  value: string
  onChange: (v: string) => void
  onCommit?: (v: string) => void
  options: string[]
  placeholder?: string
  keepValue?: boolean
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function h(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const q = value.trim().toLowerCase()
  const filtered = options.filter((o) => o.toLowerCase().includes(q)).slice(0, 40)
  const custom = q && !options.some((o) => o.toLowerCase() === q) ? value.trim() : null

  function handlePick(v: string) {
    if (keepValue) {
      onChange(v)
    } else {
      if (onCommit) onCommit(v)
      onChange('')
    }
    setOpen(false)
  }

  function handleEnter() {
    const v = value.trim()
    if (!v) return
    if (keepValue) { setOpen(false); return }
    if (onCommit) onCommit(v)
    onChange('')
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleEnter() }
          else if (e.key === 'Escape') setOpen(false)
        }}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((o) => (
            <button key={o} type="button" onClick={() => handlePick(o)}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              {o}
            </button>
          ))}
          {custom && (
            <button type="button" onClick={() => handlePick(custom)}
              className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-slate-50">
              + Use "{custom}"
            </button>
          )}
          {!filtered.length && !custom && (
            <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}

function usePagination<T>(items: T[], page: number): { items: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PER_PAGE
  return { items: items.slice(start, start + PER_PAGE), totalPages }
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (n: number) => void }) {
  if (totalPages <= 1) return null
  const pages: number[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 3) {
    for (let i = 1; i <= maxVisible; i++) pages.push(i)
  } else if (page >= totalPages - 2) {
    for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i)
  } else {
    for (let i = page - 2; i <= page + 2; i++) pages.push(i)
  }
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Previous</button>
      {pages.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
    </div>
  )
}

const currentUser: { id: string; name: string; role: string } | null = (() => {
  try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u) } catch {}
  return null
})()

const isDoctor = currentUser?.role === 'Doctor'

type Analyte = {
  key: string
  name: string
  resultType: string
  value: string
  unit: string
  refLow: string
  refHigh: string
  refRangeText: string
  flag: string
  remarks: string
  allowedValues: string[]
  abnormalValues: string[]
  resultId?: string
}

const RESULT_TYPES = ['numeric', 'qualitative', 'narrative', 'ratio', 'range', 'free_text']

const RESULT_TYPE_LABELS: Record<string, string> = {
  numeric: 'Numeric',
  qualitative: 'Qualitative',
  narrative: 'Narrative',
  ratio: 'Ratio',
  range: 'Range',
  free_text: 'Text',
}

let _analyteKey = 0
function newAnalyte(meta: any = {}): Analyte {
  return {
    key: `an-${++_analyteKey}`,
    name: meta.analyte_name || meta.name || '',
    resultType: meta.result_type || 'numeric',
    value: meta.value ?? '',
    unit: meta.unit || '',
    refLow: meta.reference_range_low || '',
    refHigh: meta.reference_range_high || '',
    refRangeText: meta.reference_range_text || '',
    flag: meta.flag_status || '',
    remarks: meta.remarks || '',
    allowedValues: Array.isArray(meta.allowed_values) ? meta.allowed_values : [],
    abnormalValues: Array.isArray(meta.abnormal_values) ? meta.abnormal_values : [],
    resultId: meta.id || undefined,
  }
}

function detectFlag(a: Analyte): string {
  if (a.resultType === 'qualitative' && a.allowedValues.length) {
    if (!a.value) return ''
    if (a.abnormalValues.includes(a.value)) return 'abnormal'
    return 'normal'
  }
  if (a.resultType === 'numeric') {
    const v = parseFloat(a.value)
    const lo = parseFloat(a.refLow)
    const hi = parseFloat(a.refHigh)
    // No value or incomplete/empty range -> no flag selected.
    if (isNaN(v) || isNaN(lo) || isNaN(hi)) return ''
    if (lo >= hi) return ''
    const span = hi - lo
    if (v < lo || v > hi) {
      // Critical: value beyond the boundary by more than 2x the range span.
      if (v < lo - 2 * span || v > hi + 2 * span) return 'critical'
      return 'abnormal'
    }
    return 'normal'
  }
  return ''
}

const flagMeta: Record<string, { label: string; active: string; idle: string }> = {
  normal: { label: 'Normal', active: 'bg-emerald-100 text-emerald-700 border-emerald-300', idle: 'bg-white text-slate-500 border-slate-200' },
  abnormal: { label: 'Abnormal', active: 'bg-amber-100 text-amber-700 border-amber-300', idle: 'bg-white text-slate-500 border-slate-200' },
  critical: { label: 'Critical', active: 'bg-rose-100 text-rose-700 border-rose-300', idle: 'bg-white text-slate-500 border-slate-200' },
}

function GrowingTextarea({ value, onChange, placeholder, className, minRows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  function autosize() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
  useEffect(() => { autosize() }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => { onChange(e.target.value); autosize() }}
      onInput={autosize}
      className={`resize-none overflow-hidden rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none ${className || ''}`} />
  )
}

function numericStatus(a: Analyte): 'abnormal' | 'normal' | null {
  if (a.resultType !== 'numeric') return null
  const v = parseFloat(a.value)
  const lo = parseFloat(a.refLow)
  const hi = parseFloat(a.refHigh)
  if (isNaN(v) || isNaN(lo) || isNaN(hi)) return null
  return (v < lo || v > hi) ? 'abnormal' : 'normal'
}

const statusStyles: Record<string, string> = {
  ordered: 'bg-blue-100 text-blue-700',
  collected: 'bg-amber-100 text-amber-700',
  processing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
  review: 'bg-rose-100 text-rose-700',
}

const statusLabels: Record<string, string> = {
  ordered: 'Ordered',
  collected: 'Collected',
  processing: 'Processing',
  completed: 'Completed',
  review: 'Rejected - Review',
  collected_results: 'Results Collected',
}

export default function LabWorklist() {
  const [orders, setOrders] = useState<any[]>([])
  const [stats, setStats] = useState({ ordered: 0, collected: 0, processing: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showMyOrders, setShowMyOrders] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [collectModal, setCollectModal] = useState<any | null>(null)
  const [printModal, setPrintModal] = useState<any | null>(null)
  const [analytes, setAnalytes] = useState<Analyte[]>([newAnalyte()])
  const [submitting, setSubmitting] = useState(false)
  const [orderRemarks, setOrderRemarks] = useState('')
  const [formError, setFormError] = useState('')
  const [specimens, setSpecimens] = useState<any[]>([])
  const [specimenModal, setSpecimenModal] = useState<any | null>(null)
  const [specimen, setSpecimen] = useState('')
  const [specimenFocused, setSpecimenFocused] = useState(false)
  const [collectSpecimens, setCollectSpecimens] = useState<string[]>([])
  const [selectedSpecimen, setSelectedSpecimen] = useState('')
  const [resultSpecimens, setResultSpecimens] = useState<string[]>([])
  const [resultSpecimenInput, setResultSpecimenInput] = useState('')

  useEffect(() => {
    api.get('/lab-specimens').then((res) => setSpecimens(res.data || [])).catch(() => {})
  }, [])

  async function loadWorklist(silent = false) {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isDoctor && !showMyOrders && currentUser?.id) params.set('doctor_id', currentUser.id)
      const paramStr = params.toString()
        const [ordRes, statsRes] = await Promise.all([
        api.get(`/lab-orders${paramStr ? `?${paramStr}&` : '?'}is_paid=true`).catch(() => ({ data: [] })),
        api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
      ])
      var allOrders = ordRes.data || []
      // Exclude completed orders from the worklist
      setOrders(allOrders.filter((o: any) => o.status !== 'completed'))
      setStats(statsRes.data || { ordered: 0, collected: 0, processing: 0, completed: 0 })
    } catch (err) { console.error('Failed to load lab worklist:', err) } finally { if (!silent) setLoading(false) }
  }

  useEffect(() => {
    loadWorklist()
    const interval = setInterval(() => loadWorklist(true), 10000)
    const onFocus = () => loadWorklist(true)
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [showMyOrders])

  async function openResultModal(order: any) {
    const isEdit = order.status === 'review'
    setFormError('')
    setOrderRemarks(order.remarks || '')
    setSelectedSpecimen(order.specimen_type || '')
    setResultSpecimens(order.specimens && order.specimens.length ? order.specimens.slice() : (order.specimen_type ? [order.specimen_type] : []))
    setResultSpecimenInput('')

    // Edit mode: reload existing (rejected) results so the scientist edits, not re-types.
    if (isEdit) {
      try {
        const res = await api.get(`/lab-results/${order.id}`)
        const rows = res.data || []
        if (rows.length) {
          setAnalytes(rows.map((r: any) => newAnalyte(r)))
          setSelectedOrder(order)
          return
        }
      } catch {}
    }

    // New entry always starts with one empty analyte; add more via "Add another analyte".
    setAnalytes([newAnalyte()])
    setSelectedOrder(order)
  }

  function openCollectModal(order: any) {
    setCollectSpecimens([])
    setSpecimen('')
    setSpecimenFocused(false)
    setSpecimenModal(order)
  }

  const FREQUENT_ORDER = ['Blood', 'Urine', 'Stool', 'Sputum', 'CSF (Cerebrospinal Fluid)', 'Swab', 'Pus', 'Serum', 'Plasma']
  const frequentSpecimens = (specimens || []).filter((s) => s.is_frequent).sort((a, b) => {
    const ia = FREQUENT_ORDER.indexOf(a.name)
    const ib = FREQUENT_ORDER.indexOf(b.name)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  const specimenQuery = specimen.trim().toLowerCase()
  const filteredSpecimens = specimenQuery
    ? (specimens || []).filter((s) => s.name.toLowerCase().includes(specimenQuery))
    : []

  function toggleCollectSpecimen(name: string) {
    setCollectSpecimens((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])
  }

  async function handleConfirmCollect() {
    if (!specimenModal) return
    const finalList = Array.from(new Set(collectSpecimens.map((s) => s.trim()).filter(Boolean)))
    if (finalList.length === 0) return
    setCollectingId(specimenModal.id)
    try {
      await api.put(`/lab-orders/${specimenModal.id}`, {
        status: 'collected',
        collected_at: new Date().toISOString(),
        specimens: finalList,
      })
      setOrders((prev) => prev.map((o) => o.id === specimenModal.id ? { ...o, status: 'collected', specimens: finalList, specimen_type: finalList[0] } : o))
      setStats((prev) => ({ ...prev, ordered: Math.max(0, prev.ordered - 1), collected: prev.collected + 1 }))
      setSpecimenModal(null)
    } catch (err) { console.error('Collect failed:', err) } finally { setCollectingId(null) }
  }

  function addAnalyte() {
    setAnalytes((prev) => [...prev, newAnalyte()])
  }

  function updateAnalyte(idx: number, field: string, val: any) {
    setAnalytes((prev) => prev.map((a, i) => {
      if (i !== idx) return a
      const next = { ...a, [field]: val }
      // Recompute the flag when the value or reference range changes.
      if (field === 'value' || field === 'refLow' || field === 'refHigh') {
        next.flag = a.flag === 'critical' ? 'critical' : detectFlag(next)
      }
      return next
    }))
  }

  function removeAnalyte(idx: number) {
    setAnalytes((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmitResults() {
    if (!selectedOrder) return
    setFormError('')
    const valid = analytes.filter((a) => a.name && a.value !== undefined && a.value !== '')
    if (valid.length === 0) {
      setFormError('Enter at least one analyte name and result value.')
      return
    }
    if (valid.some((a) => a.resultType === 'qualitative' && a.allowedValues.length && !a.allowedValues.includes(a.value))) {
      setFormError(`"${valid.find((a) => a.resultType === 'qualitative' && a.allowedValues.length && !a.allowedValues.includes(a.value))?.name}" value is not in the allowed options.`)
      return
    }
    setSubmitting(true)
    try {
      // Validate reference ranges before saving (server rejects low >= high).
      for (const a of valid) {
        const lo = parseFloat(a.refLow)
        const hi = parseFloat(a.refHigh)
        if (a.refLow && a.refHigh && !isNaN(lo) && !isNaN(hi) && lo >= hi) {
          setFormError(`"${a.name}": reference range low must be less than high.`)
          setSubmitting(false)
          return
        }
      }
      for (const a of valid) {
        const payload: any = {
          lab_order_id: selectedOrder.id,
          analyte_name: a.name,
          value: a.value,
          reference_range_low: a.refLow || null,
          reference_range_high: a.refHigh || null,
          result_type: a.resultType,
          unit: a.unit || null,
          ref_range_text: a.refRangeText || null,
          flag_status: a.flag || null,
          remarks: a.remarks || null,
          entered_by: currentUser?.id || null,
        }
        if (a.resultId) {
          await api.put(`/lab-results/${a.resultId}`, payload)
        } else {
          await api.post('/lab-results', payload)
        }
      }
      // Save report-level General Lab Remarks + specimen (if changed).
      const orderPatch: any = {}
      if (orderRemarks && orderRemarks.trim()) orderPatch.remarks = orderRemarks
      const finalSpecimens = Array.from(new Set(resultSpecimens.map((s) => s.trim()).filter(Boolean)))
      const prevSpecimens = selectedOrder.specimens || (selectedOrder.specimen_type ? [selectedOrder.specimen_type] : [])
      const trimmedSpecimen = (selectedSpecimen || '').trim()
      if (finalSpecimens.length && JSON.stringify(finalSpecimens) !== JSON.stringify(prevSpecimens)) orderPatch.specimens = finalSpecimens
      if (trimmedSpecimen && trimmedSpecimen !== (selectedOrder.specimen_type || '')) orderPatch.specimen_type = trimmedSpecimen
      if (Object.keys(orderPatch).length) {
        await api.put(`/lab-orders/${selectedOrder.id}`, orderPatch)
      }
      setAnalytes([newAnalyte()])
      setOrderRemarks('')
      setSelectedSpecimen('')
      setSelectedOrder(null)
      const [ordRes, statsRes] = await Promise.all([
        api.get('/lab-orders?is_paid=true').catch(() => ({ data: [] })),
        api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
      ])
      setOrders((ordRes.data || []).filter((o: any) => o.status !== 'completed'))
      setStats(statsRes.data)
    } catch (err: any) {
      console.error('Submit results failed:', err)
      const serverMsg = err?.response?.data?.message
      setFormError(serverMsg ? `Failed to save: ${serverMsg}` : 'Failed to save results. Please try again.')
    } finally { setSubmitting(false) }
  }

  async function handleMarkCollected() {
    if (!collectModal) return
    try {
      await api.put(`/lab-orders/${collectModal.id}`, { results_collected_at: new Date().toISOString() })
      setOrders((prev) => prev.map((x) => x.id === collectModal.id ? { ...x, results_collected_at: new Date().toISOString() } : x))
      setCollectModal(null)
    } catch (err) { console.error('Mark collected failed:', err) }
  }

  async function openPrintModal(orderId: string) {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    try {
      const res = await api.get(`/lab-results/${orderId}`)
      setPrintModal({ ...order, results: res.data || [] })
    } catch { setPrintModal(order) }
  }

  const filteredOrders = orders.filter((o: any) => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      (o.patient_name || '').toLowerCase().includes(q) ||
      (o.lab_number || '').toLowerCase().includes(q) ||
      (o.test_name || '').toLowerCase().includes(q) ||
      (o.doctor_name || '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || (statusFilter === 'collected_results' ? !!o.results_collected_at : o.status === statusFilter)
    return matchSearch && matchStatus
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Lab Worklist</h1>
          <p className="text-sm text-slate-500">Manage lab orders, samples, and results</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: 'Ordered', value: stats.ordered, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Collected', value: stats.collected, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Processing', value: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patient, lab #, or test..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          <option value="ordered">Ordered</option>
          <option value="collected">Collected</option>
          <option value="processing">Processing</option>
          <option value="review">Review</option>
          <option value="collected_results">Results Collected</option>
        </select>
        {isDoctor && (
          <button onClick={() => setShowMyOrders((p) => !p)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
              showMyOrders ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-primary text-white shadow-md'
            }`}>
            {showMyOrders ? 'All Orders' : 'My Orders'}
          </button>
        )}
      </div>

      {/* Order Cards */}
      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FlaskConical size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No lab orders found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usePagination(filteredOrders, page).items.map((o: any) => (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FlaskConical size={15} className="text-purple-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium flex-shrink-0 ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                    {statusLabels[o.status] || o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                  </span>
                  {o.is_paid === false && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">Unpaid</span>
                  )}
                  {o.is_paid === true && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">Paid</span>
                  )}
                  {o.priority && o.priority !== 'routine' && (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex-shrink-0 ${o.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {o.priority.toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="px-5 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                  {o.lab_number && <p className="text-xs text-slate-400 font-mono">
                    {o.request_number ? `#${o.request_number} / ${o.order_number}` : `#${o.lab_number}`}
                  </p>}
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    {((o.specimens && o.specimens.length ? o.specimens.join(', ') : o.specimen_type)) && <span>Specimen: {(o.specimens && o.specimens.length ? o.specimens.join(', ') : o.specimen_type)}</span>}
                    {o.doctor_name && <span>Requested by: {o.doctor_name}</span>}
                    {o.referred_by && !o.doctor_name && <span>Referred by: {o.referred_by}</span>}
                  </p>
                  {o.doctor_comment && <DoctorComment comment={o.doctor_comment} />}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {o.status === 'ordered' && (
                    <button onClick={() => openCollectModal(o)} disabled={collectingId === o.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50">
                      {collectingId === o.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                      Collect Sample
                    </button>
                  )}
                  {o.status === 'collected' && (
                    <button onClick={() => openResultModal(o)}
                      className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100 transition-colors">Enter Results</button>
                  )}
                  {o.status === 'review' && (
                    <button onClick={() => openResultModal(o)}
                      className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors">Edit Results</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={usePagination(filteredOrders, page).totalPages} onChange={setPage} />

      {/* Analyte Entry Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setSelectedOrder(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FlaskConical size={18} className="text-purple-500" /> {selectedOrder.test_name}
              </h2>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="text-sm">
                <p className="text-slate-800 flex items-center gap-2 flex-wrap">
                  <span><strong>Patient:</strong> {selectedOrder.patient_name || 'Walk-in Patient'}</span>
                  {selectedOrder.primary_provider && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                      <Shield size={10} /> {selectedOrder.primary_provider}
                    </span>
                  )}
                  {selectedOrder.lab_number && <span className="text-slate-400 font-mono ml-2">#{selectedOrder.lab_number}</span>}
                </p>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                  <span>Priority: <span className="uppercase font-semibold">{selectedOrder.priority || 'routine'}</span></span>
                  {selectedOrder.doctor_name && <span>Requested by: {selectedOrder.doctor_name}</span>}
                </p>
              </div>

              {/* Collected specimens */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Collected Specimens</label>
                {resultSpecimens.length ? (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {resultSpecimens.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                        <FlaskConical size={12} /> {name}
                        <button onClick={() => setResultSpecimens((prev) => prev.filter((x) => x !== name))} className="text-emerald-400 hover:text-emerald-700"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mb-2">No specimen recorded for this order.</p>
                )}
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Add Specimen</label>
                <div className="flex gap-2">
                  <div className="w-full">
                    <ThemedCombobox
                      value={resultSpecimenInput}
                      onChange={setResultSpecimenInput}
                      onCommit={(v) => setResultSpecimens((prev) => prev.includes(v) ? prev : [...prev, v])}
                      options={(specimens || []).map((s: any) => s.name)}
                      placeholder="Search or type a specimen, press Enter to add..."
                    />
                  </div>
                  <button
                    onClick={() => { const v = resultSpecimenInput.trim(); if (v) { setResultSpecimens((prev) => prev.includes(v) ? prev : [...prev, v]); setResultSpecimenInput('') } }}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
              {selectedOrder.doctor_comment && <DoctorComment comment={selectedOrder.doctor_comment} />}

              {analytes.map((a, idx) => (
                <div key={a.key} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-500">Analyte{analytes.length > 1 ? ` ${idx + 1}` : ''}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={a.resultType}
                        onChange={(e) => updateAnalyte(idx, 'resultType', e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:ring-2 focus:ring-primary outline-none">
                        {RESULT_TYPES.map((t) => <option key={t} value={t}>{RESULT_TYPE_LABELS[t] || t}</option>)}
                      </select>
                      {analytes.length > 1 && (
                        <button onClick={() => removeAnalyte(idx)} className="text-rose-400 hover:text-rose-600 p-0.5"><X size={14} /></button>
                      )}
                    </div>
                  </div>

                  <input type="text" placeholder="Analyte name (e.g. Hemoglobin)" value={a.name}
                    onChange={(e) => updateAnalyte(idx, 'name', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />

                  {/* Type-aware value input */}
                  {a.resultType === 'numeric' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 col-span-2">
                          <input type="number" step="any" placeholder="Value" value={a.value}
                            onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                          <div className="w-28">
                            <ThemedCombobox
                              value={a.unit}
                              onChange={(v) => updateAnalyte(idx, 'unit', v)}
                              options={LAB_UNITS}
                              placeholder="Unit"
                              keepValue
                            />
                          </div>
                        </div>
                        <input type="number" step="any" placeholder="Ref low" value={a.refLow}
                          onChange={(e) => updateAnalyte(idx, 'refLow', e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <input type="number" step="any" placeholder="Ref high" value={a.refHigh}
                          onChange={(e) => updateAnalyte(idx, 'refHigh', e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <input type="text" placeholder="Ref range text (e.g. < 5, 1:16)" value={a.refRangeText}
                          onChange={(e) => updateAnalyte(idx, 'refRangeText', e.target.value)}
                          className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                      {numericStatus(a) && (
                        <p className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${numericStatus(a) === 'abnormal' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {numericStatus(a) === 'abnormal' ? '⚠ Abnormal — value outside reference range' : '✓ Within reference range'}
                        </p>
                      )}
                    </div>
                  )}
                  {a.resultType === 'qualitative' && (
                    <div className="grid grid-cols-2 gap-2">
                      {a.allowedValues.length ? (
                        <select value={a.value} onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                          className="col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none">
                          <option value="">-- Select result --</option>
                          {a.allowedValues.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input type="text" placeholder="Result (e.g. Negative, 2+)" value={a.value}
                          onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                          className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      )}
                      <input type="text" placeholder="Reference (e.g. Negative)" value={a.refRangeText}
                        onChange={(e) => updateAnalyte(idx, 'refRangeText', e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  )}
                  {a.resultType === 'narrative' && (
                    <GrowingTextarea
                      minRows={3}
                      placeholder="Descriptive result / microscopy findings..."
                      value={a.value}
                      onChange={(v) => updateAnalyte(idx, 'value', v)}
                      className="w-full" />
                  )}
                  {a.resultType === 'ratio' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Titer / ratio (e.g. 1:64)" value={a.value}
                        onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <input type="text" placeholder="Reference (e.g. < 1:16)" value={a.refRangeText}
                        onChange={(e) => updateAnalyte(idx, 'refRangeText', e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  )}
                  {a.resultType === 'range' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Range value (e.g. 40 - 150)" value={a.value}
                        onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <input type="text" placeholder="Reference (e.g. 50 - 200)" value={a.refRangeText}
                        onChange={(e) => updateAnalyte(idx, 'refRangeText', e.target.value)}
                        className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  )}
                  {a.resultType === 'free_text' && (
                    <GrowingTextarea
                      minRows={1}
                      placeholder="Write result"
                      value={a.value}
                      onChange={(v) => updateAnalyte(idx, 'value', v)}
                      className="w-full" />
                  )}

                  {/* Flag toggle */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">Flag:</span>
                    {(['normal', 'abnormal', 'critical'] as const).map((f) => (
                      <button key={f} onClick={() => updateAnalyte(idx, 'flag', f)}
                        className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${a.flag === f ? flagMeta[f].active : flagMeta[f].idle}`}>
                        {flagMeta[f].label}
                      </button>
                    ))}
                  </div>

                  {/* Per-analyte note */}
                  <GrowingTextarea
                    minRows={1}
                    placeholder={analytes.length > 1 ? `Analyte ${idx + 1} Note (e.g sample hemolyzed)...` : 'Analyte Note (e.g sample hemolyzed)...'}
                    value={a.remarks}
                    onChange={(v) => updateAnalyte(idx, 'remarks', v)}
                    className="w-full" />
                </div>
              ))}
              <button onClick={addAnalyte}
                className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                <Plus size={14} /> Add another analyte
              </button>

              {/* General Lab Remarks (report level) — placed at the end */}
              <div className="pt-2 border-t border-slate-200">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">General Lab Remarks</label>
                <GrowingTextarea
                  minRows={2}
                  placeholder="Overall laboratory notes: sample quality, methodology, interpretive comment..."
                  value={orderRemarks}
                  onChange={setOrderRemarks}
                  className="w-full bg-white" />
              </div>

              {formError && (
                <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSubmitResults} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Saving...' : 'Save Results'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Sample - Specimen Modal */}
      {specimenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!collectingId) setSpecimenModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FlaskConical size={18} className="text-amber-500" /> Collect Sample</h2>
              <button onClick={() => setSpecimenModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm">
                <p className="text-slate-800"><strong>Patient:</strong> {specimenModal.patient_name || 'Walk-in Patient'}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {specimenModal.test_name}{specimenModal.lab_number ? ` · #${specimenModal.lab_number}` : ''}
                </p>
              </div>

              {/* Selected specimens */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Selected ({collectSpecimens.length})</label>
                {collectSpecimens.length === 0 ? (
                  <p className="text-xs text-slate-400">No specimen selected. Pick from OPTIONS below or type a new one.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {collectSpecimens.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                        {name}
                        <button onClick={() => toggleCollectSpecimen(name)} className="text-emerald-400 hover:text-emerald-700"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Searchable dropdown / free-text */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Search / Add Specimen</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search or type a specimen, press Enter to add..."
                    value={specimen}
                    autoFocus
                    onChange={(e) => { setSpecimen(e.target.value); setSpecimenFocused(true) }}
                    onFocus={() => setSpecimenFocused(true)}
                    onBlur={() => setTimeout(() => setSpecimenFocused(false), 150)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = specimen.trim(); if (v) { toggleCollectSpecimen(v); setSpecimen(''); setSpecimenFocused(false) } } }}
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  {specimenFocused && specimen.trim() !== '' && filteredSpecimens.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filteredSpecimens.map((s: any) => (
                        <button key={s.id} onClick={() => { toggleCollectSpecimen(s.name); setSpecimen(''); setSpecimenFocused(false) }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          {s.name}
                          {collectSpecimens.includes(s.name) && <span className="ml-2 text-[10px] font-medium text-emerald-600">Selected</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {specimen.trim() && (
                  <button onClick={() => { toggleCollectSpecimen(specimen.trim()); setSpecimen('') }}
                    className="mt-1.5 text-xs text-primary font-medium hover:underline">
                    + Add "{specimen.trim()}" as custom specimen
                  </button>
                )}
              </div>

              {/* Specimen option cards */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">OPTIONS</label>
                <div className="flex flex-wrap gap-2">
                  {frequentSpecimens.map((s: any) => (
                    <button key={s.id} onClick={() => toggleCollectSpecimen(s.name)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${collectSpecimens.includes(s.name) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button onClick={() => setSpecimenModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleConfirmCollect} disabled={collectingId === specimenModal.id || collectSpecimens.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {collectingId === specimenModal.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {collectingId === specimenModal.id ? 'Saving...' : 'Confirm Collect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Confirmation Modal */}
      {collectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setCollectModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><CheckCircle size={18} className="text-sky-500" /> Mark as Collected</h2>
              <button onClick={() => setCollectModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Confirm that <strong>{collectModal.patient_name || 'this patient'}</strong> has collected their results?
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Test: {collectModal.test_name} &middot; {collectModal.lab_number ? `#${collectModal.lab_number}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setCollectModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleMarkCollected} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-all">
                <CheckCircle size={14} /> Confirm Collected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print / View Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setPrintModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800">MACHOKO MEMORIAL HOSPITAL</h3>
                <p className="text-xs text-slate-400">Machoko Diamond Plaza, Mile 6 Road Bye-Pass, Jalingo, Taraba State</p>
                <p className="text-xs text-slate-400">Tel: 0802900231, 07068855750, 08068862666</p>
                <p className="text-xs text-slate-400">Laboratory Report</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-medium">{printModal.patient_name || 'Walk-in Patient'}</span>
                  {printModal.lab_number && <span className="text-slate-400 font-mono text-xs">#{printModal.lab_number}{printModal.request_number ? ` / ${printModal.request_number}` : ''}{printModal.order_number ? ` / ${printModal.order_number}` : ''}</span>}
                </div>
                <div><span className="text-slate-500">Test:</span> <span className="font-medium">{printModal.test_name}</span></div>
                <div><span className="text-slate-500">Specimen:</span> <span className="font-medium">{printModal.specimen_type || '—'}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(printModal.created_at).toLocaleString()}</span></div>
                <div><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{printModal.status}</span>
                  {printModal.results_collected_at && <span className="ml-2 text-sky-600 text-xs">— Collected {new Date(printModal.results_collected_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
              {printModal.doctor_name && (
                <p className="text-sm text-slate-500">Requested by: <strong>{printModal.doctor_name}</strong></p>
              )}
              {printModal.referred_by && (
                <p className="text-sm text-slate-500">Referred by: <strong>{printModal.referred_by}</strong></p>
              )}

              {printModal.results && printModal.results.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Results</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {printModal.results.map((r: any) => (
                      <div key={r.id} className={`px-4 py-3 flex items-center justify-between text-sm ${r.is_abnormal ? 'bg-rose-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-medium text-slate-700">{r.analyte_name}</span>
                          <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-slate-400">
                            Ref: {r.reference_range_low || '?'}–{r.reference_range_high || '?'}
                          </span>
                          {r.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                          {r.result_number && <span className="text-xs text-slate-400 font-mono">#{r.result_number}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400 text-center pt-3 border-t border-slate-100">This is a computer-generated report.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
              <button onClick={() => {
                const resultsTxt = (printModal.results || []).map((r: any) => `${r.analyte_name}: ${r.value} (Ref: ${r.reference_range_low || '?'}–${r.reference_range_high || '?'})`).join('\n')
                const txt = `MACHOKO MEMORIAL HOSPITAL - Laboratory Report\n#${printModal.lab_number || ''}\nPatient: ${printModal.patient_name || 'Walk-in Patient'}\nTest: ${printModal.test_name}\nSpecimen: ${printModal.specimen_type || '—'}\nDate: ${new Date(printModal.created_at).toLocaleString()}\nStatus: ${printModal.status}\n${resultsTxt ? '\nResults:\n' + resultsTxt : ''}`
                navigator.clipboard?.writeText(txt)
              }} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                <Copy size={14} /> Copy
              </button>
              <button onClick={() => printLabReport(printModal, printModal.results || [])} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">
                <Printer size={14} /> Print
              </button>
              <button onClick={() => setPrintModal(null)} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
