import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  FlaskConical, Search, Loader2, CheckCircle, XCircle, AlertTriangle, Plus, X, Clock, FileText, User, Phone, ArrowLeft
} from 'lucide-react'

const SPECIMEN_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'CSF', 'Swab', 'Tissue', 'Serum', 'Plasma', 'Other']
const PRIORITIES = ['routine', 'urgent', 'stat']

const PER_PAGE = 15

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

const statusStyles: Record<string, string> = {
  ordered: 'bg-blue-100 text-blue-700',
  collected: 'bg-amber-100 text-amber-700',
  processing: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

export default function LaboratoryWorkbench() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'worklist' | 'results' | 'history' | 'orders'>('worklist')
  const [showDirectRequest, setShowDirectRequest] = useState(false)
  const [worklistPage, setWorklistPage] = useState(1)
  const [pendingPage, setPendingPage] = useState(1)
  const [completedPage, setCompletedPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const prevTab = useRef(tab)
  useEffect(() => {
    if (prevTab.current !== tab) {
      setWorklistPage(1); setPendingPage(1); setCompletedPage(1); setHistoryPage(1)
      prevTab.current = tab
    }
  }, [tab])
  const [orders, setOrders] = useState<any[]>([])
  const [drafts, setDrafts] = useState<any[]>([])
  const [stats, setStats] = useState({ ordered: 0, collected: 0, processing: 0, completed: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [analytes, setAnalytes] = useState<{ name: string; value: string; refLow: string; refHigh: string }[]>([{ name: '', value: '', refLow: '', refHigh: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [activeResultTab, setActiveResultTab] = useState<'pending' | 'completed' | 'collected'>('pending')
  const [walkinForm, setWalkinForm] = useState({ patient_name: '', patient_phone: '', specimen_type: '', priority: 'routine', referred_by: '' })
  const [selectedTests, setSelectedTests] = useState<{ name: string; specimen_type?: string }[]>([])
  const [walkinSubmitting, setWalkinSubmitting] = useState(false)
  const [printModal, setPrintModal] = useState<any | null>(null)
  const [testCatalog, setTestCatalog] = useState<any[]>([])
  const [testSearch, setTestSearch] = useState('')
  const [showTestDropdown, setShowTestDropdown] = useState(false)
  const [collectModal, setCollectModal] = useState<any | null>(null)
  const [historyResults, setHistoryResults] = useState<any[]>([])
  const [completedSearch, setCompletedSearch] = useState('')
  const [completedOrders, setCompletedOrders] = useState<any[]>([])
  const [collectedSearch, setCollectedSearch] = useState('')
  const [walkinResultsFilter, setWalkinResultsFilter] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [convertModal, setConvertModal] = useState<any | null>(null)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    api.get('/lab-test-catalog').then((r) => setTestCatalog(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'history') {
      api.get('/lab-results?status=completed').then((r) => setHistoryResults(r.data || [])).catch(() => {})
    }
    if (tab === 'orders') {
      api.get('/payments/pending-orders?service_type=lab').then((r) => setPendingOrders(r.data || [])).catch(() => {})
    }
    if (tab === 'results') {
      Promise.all([
        api.get('/lab-orders?status=completed').catch(() => ({ data: [] })),
        api.get('/lab-orders?status=collected').catch(() => ({ data: [] })),
      ]).then(([completedRes, collectedRes]) => {
        setCompletedOrders([...(completedRes.data || []), ...(collectedRes.data || [])])
      })
    }
  }, [tab])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (isDoctor && !showAllResults && currentUser?.id) params.set('doctor_id', currentUser.id)
        const paramStr = params.toString()
        const [ordRes, draftRes, statsRes] = await Promise.all([
          api.get(`/lab-orders${paramStr ? `?${paramStr}` : ''}`).catch(() => ({ data: [] })),
          api.get('/lab-results?status=draft').catch(() => ({ data: [] })),
          api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
        ])
        setOrders(ordRes.data || [])
        setDrafts(draftRes.data || [])
        setStats(statsRes.data)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [tab, showAllResults])

  async function handleCollect(id: string) {
    await api.put(`/lab-orders/${id}`, { status: 'collected', collected_at: new Date().toISOString() })
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: 'collected' } : o))
  }

  function addAnalyte() {
    setAnalytes((prev) => [...prev, { name: '', value: '', refLow: '', refHigh: '' }])
  }

  function updateAnalyte(idx: number, field: string, val: string) {
    setAnalytes((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a))
  }

  function removeAnalyte(idx: number) {
    setAnalytes((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmitResults() {
    if (!selectedOrder) return
    const valid = analytes.filter((a) => a.name && a.value)
    if (valid.length === 0) return
    setSubmitting(true)
    try {
      for (const a of valid) {
        const isAbnormal = a.refLow && a.refHigh &&
          (parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh))
        await api.post('/lab-results', {
          lab_order_id: selectedOrder.id, analyte_name: a.name, value: a.value,
          reference_range_low: a.refLow || null, reference_range_high: a.refHigh || null, is_abnormal: isAbnormal || false,
          entered_by: currentUser?.id || null,
        })
      }
      setAnalytes([{ name: '', value: '', refLow: '', refHigh: '' }])
      setSelectedOrder(null)
      const [ordRes, draftRes] = await Promise.all([
        api.get('/lab-orders').catch(() => ({ data: [] })),
        api.get('/lab-results?status=draft').catch(() => ({ data: [] })),
      ])
      setOrders(ordRes.data || [])
      setDrafts(draftRes.data || [])
    } catch {} finally { setSubmitting(false) }
  }

  async function handleApprove(resultId: string) {
    const staffId = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()
    if (!staffId) return
    try {
      await api.put(`/lab-results/${resultId}/approve`, { approved_by: staffId })
      setDrafts((prev) => prev.filter((d) => d.id !== resultId))
      const [ordRes, statsRes] = await Promise.all([
        api.get('/lab-orders').catch(() => ({ data: [] })),
        api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
      ])
      setOrders(ordRes.data || [])
      setStats(statsRes.data)
    } catch (err: any) { console.error('Approve failed:', err) }
  }

  async function handleReject(resultId: string) {
    try {
      await api.put(`/lab-results/${resultId}/reject`)
      setDrafts((prev) => prev.filter((d) => d.id !== resultId))
    } catch (err: any) { console.error('Reject failed:', err) }
  }

  async function printResult(labOrderId: string) {
    const order = orders.find((o) => o.id === labOrderId)
    if (!order) return
    try {
      const res = await api.get(`/lab-results/${labOrderId}`)
      setPrintModal({ ...order, results: res.data || [] })
    } catch { setPrintModal(order) }
  }

  async function handleMarkCollected() {
    if (!collectModal) return
    try {
      await api.put(`/lab-orders/${collectModal.id}`, { results_collected_at: new Date().toISOString() })
      setOrders((prev) => prev.map((x) => x.id === collectModal.id ? { ...x, results_collected_at: new Date().toISOString() } : x))
      setCollectModal(null)
    } catch {}
  }

  async function handleWalkinSubmit() {
    if (selectedTests.length === 0 || !walkinForm.patient_name || !walkinForm.patient_phone?.trim()) return
    setWalkinSubmitting(true)
    const requestNumber = `REQ-${Date.now().toString(36).toUpperCase().slice(-5)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`
    const patientPhone = walkinForm.patient_phone.trim()
    const labId = patientPhone.replace(/\D/g, '')
    try {
      for (const test of selectedTests) {
        const payload: any = {
          test_name: test.name, patient_name: walkinForm.patient_name, patient_phone: patientPhone,
          specimen_type: test.specimen_type || null, priority: walkinForm.priority,
          referred_by: walkinForm.referred_by || null, request_number: requestNumber, lab_number: labId,
        }
        await api.post('/lab-orders', payload)
      }
      setSelectedTests([])
      setWalkinForm({ patient_name: '', patient_phone: '', specimen_type: '', priority: 'routine', referred_by: '' })
      const [ordRes, statsRes] = await Promise.all([
        api.get('/lab-orders').catch(() => ({ data: [] })),
        api.get('/lab-orders/stats').catch(() => ({ data: { ordered: 0, collected: 0, processing: 0, completed: 0 } })),
      ])
      setOrders(ordRes.data || [])
      setStats(statsRes.data)
    } catch {} finally { setWalkinSubmitting(false) }
  }

  const filteredOrders = orders.filter((o: any) => {
    const q = search.toLowerCase()
    const matchSearch = (o.patient_name || '').toLowerCase().includes(q) ||
      (o.lab_number || '').toLowerCase().includes(q) ||
      (o.test_name || '').toLowerCase().includes(q)
    const matchStatus = !statusFilter || (statusFilter === 'collected_results' ? !!o.results_collected_at : o.status === statusFilter)
    const matchPaid = o.is_paid === true || (o.is_paid === null && o.payment_id != null) || (!o.encounter_id && o.patient_name != null)
    const matchWalkin = !walkinResultsFilter || (!!o.patient_phone && o.status === 'completed')
    const matchDoctorView = !isDoctor || showAllResults || !!o.doctor_name
    const matchNotTerminal = o.status !== 'completed' && o.status !== 'cancelled'
    return matchSearch && matchStatus && matchWalkin && matchDoctorView && matchPaid && matchNotTerminal
  })

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Laboratory</h1>
            <p className="text-sm text-slate-500">Manage lab orders, results, and walk-in tests</p>
          </div>
        </div>
        <button onClick={() => { setShowDirectRequest((p) => !p); if (!showDirectRequest) setTab('worklist') }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${showDirectRequest ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          <Plus size={16} /> Direct Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Ordered', value: stats.ordered, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Collected', value: stats.collected, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Processing', value: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'orders', label: `Orders (${pendingOrders.length})`, icon: Clock },
          { id: 'worklist', label: `Worklist (${filteredOrders.length})`, icon: FileText },
          { id: 'results', label: `Results (${drafts.length})`, icon: CheckCircle },
          { id: 'history', label: `History (${orders.filter(o => o.status === 'completed').length})`, icon: Clock },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Worklist Tab */}
      {tab === 'worklist' && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search patient, lab #, or test..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
              <option value="">All Statuses</option>
              <option value="ordered">Ordered</option>
              <option value="collected">Collected</option>
              <option value="processing">Processing</option>
              <option value="collected_results">Results Collected</option>
            </select>
            {isDoctor && (
              <button onClick={() => setShowAllResults((p) => !p)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
                  showAllResults ? 'bg-primary text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                <Search size={14} /> {showAllResults ? 'Showing All Results' : 'My Orders'}
              </button>
            )}
            <button onClick={() => setWalkinResultsFilter((p) => !p)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all whitespace-nowrap ${
                walkinResultsFilter ? 'bg-sky-100 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              <CheckCircle size={14} /> Walk-in Results
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <FlaskConical size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No lab orders found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {usePagination(filteredOrders, worklistPage).items.map((o) => (
                <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-3">
                      <FlaskConical size={15} className="text-purple-500" />
                      <span className="text-sm font-semibold text-slate-800">{o.test_name}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                      </span>
                      {o.is_paid === false && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700">Unpaid</span>
                      )}
                      {o.is_paid === true && (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-emerald-100 text-emerald-700">Paid</span>
                      )}
                      {o.priority && o.priority !== 'routine' && (
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${o.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {o.priority.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                      {o.lab_number && <p className="text-xs text-slate-400 font-mono">
                        {o.request_number ? `#${o.request_number} / ${o.order_number}` : `#${o.lab_number}`}
                      </p>}
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        {o.specimen_type && <span>Specimen: {o.specimen_type}</span>}
                        {o.doctor_name && <span> &middot; Requested by: {o.doctor_name}</span>}
                        {o.referred_by && <span> &middot; Referred by: {o.referred_by}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {o.status === 'ordered' && o.is_paid !== false && (
                        <button onClick={() => handleCollect(o.id)} className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors">Collect Sample</button>
                      )}
                      {(o.status === 'collected' || o.status === 'ordered') && o.is_paid !== false && (
                        <button onClick={() => setSelectedOrder(o)} className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100 transition-colors">Enter Results</button>
                      )}
                      {o.status === 'ordered' && o.is_paid === false && (
                        <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed">Awaiting Payment</span>
                      )}
                      {o.status === 'completed' && (
                        <>
                          <button onClick={() => printResult(o.id)} className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1"><FileText size={12} /> View</button>
                          {o.results_collected_at ? (
                            <span className="text-xs text-sky-600 font-medium flex items-center gap-1"><CheckCircle size={12} /> Collected</span>
                          ) : (
                            <button onClick={() => setCollectModal(o)} className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 text-xs font-medium hover:bg-sky-100 transition-colors">Mark Collected</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination page={worklistPage} totalPages={usePagination(filteredOrders, worklistPage).totalPages} onChange={setWorklistPage} />
        </>
      )}

      {/* Results Tab */}
      {tab === 'results' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setActiveResultTab('pending')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeResultTab === 'pending' ? 'bg-amber-500 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              Pending Approval ({drafts.length})
            </button>
            <button onClick={() => setActiveResultTab('completed')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeResultTab === 'completed' ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              Completed ({stats.completed})
            </button>
            <button onClick={() => setActiveResultTab('collected')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeResultTab === 'collected' ? 'bg-sky-500 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              Collected ({orders.filter((o: any) => o.status === 'collected').length})
            </button>
          </div>

          {/* Pending Approval */}
          {activeResultTab === 'pending' && (
            drafts.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-slate-400">
                <CheckCircle size={48} className="text-emerald-300 mb-3" />
                <p className="text-sm font-medium">All results approved</p>
              </div>
            ) : (
              <div className="space-y-3">
                {usePagination(drafts, pendingPage).items.map((d: any) => (
                  <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{d.test_name}</span>
                        <span className="text-xs text-slate-400 ml-2">{d.full_patient_name || d.patient_name || 'Unknown'}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-purple-100 text-purple-700 text-[10px] font-medium">{d.analyte_name}</span>
                    </div>
                    <div className={`flex items-center justify-between p-3 rounded-xl text-sm ${d.is_abnormal ? 'bg-rose-50' : 'bg-slate-50'}`}>
                      <span className={`font-bold ${d.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{d.value}</span>
                      <span className="text-xs text-slate-400">Ref: {d.reference_range_low || '?'}–{d.reference_range_high || '?'}</span>
                      {d.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => handleApprove(d.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-medium hover:bg-emerald-100 transition-colors">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => handleReject(d.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-colors">
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
          {activeResultTab === 'pending' && <Pagination page={pendingPage} totalPages={usePagination(drafts, pendingPage).totalPages} onChange={setPendingPage} />}

          {/* Completed Results */}
          {activeResultTab === 'completed' && (
            <>
              <div className="relative max-w-sm">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search patient or test name..." value={completedSearch}
                  onChange={(e) => setCompletedSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
              </div>
              {(() => {
                const q = completedSearch.toLowerCase()
                const filtered = completedOrders.filter((o: any) =>
                  (o.patient_name || '').toLowerCase().includes(q) ||
                  (o.test_name || '').toLowerCase().includes(q) ||
                  (o.lab_number || '').toLowerCase().includes(q)
                )
                const { items, totalPages } = usePagination(filtered, completedPage)
                return items.length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-slate-400">
                    <FileText size={48} className="text-slate-300 mb-3" />
                    <p className="text-sm font-medium">No completed results</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((o: any) => (
                      <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800">{o.test_name}</span>
                              {!o.encounter_id && o.patient_name && (
                                <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-700 text-[10px] font-medium">Walk-in</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">{o.patient_name || 'Unknown'} {o.lab_number ? <span className="font-mono"> &middot; #{o.lab_number}</span> : ''}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-medium">Completed</span>
                            <button onClick={() => printResult(o.id)} className="px-3 py-1.5 rounded-lg bg-white text-slate-600 text-xs font-medium border border-slate-200 hover:bg-slate-50 transition-colors"><FileText size={12} /> View</button>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Pagination page={completedPage} totalPages={totalPages} onChange={setCompletedPage} />
                  </div>
                )
              })()}
            </>
          )}

          {/* Collected Orders */}
          {activeResultTab === 'collected' && (
            (() => {
              const q = collectedSearch.toLowerCase()
              const collected = orders.filter((o: any) => o.status === 'collected' && (
                (o.patient_name || '').toLowerCase().includes(q) ||
                (o.test_name || '').toLowerCase().includes(q) ||
                (o.lab_number || '').toLowerCase().includes(q)
              ))
              const { items, totalPages } = usePagination(collected, pendingPage)
              return (
                <div className="space-y-4">
                  <div className="relative max-w-sm">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search patient, test, or lab #..." value={collectedSearch}
                      onChange={(e) => setCollectedSearch(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
                  </div>
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center py-16 text-slate-400">
                      <FlaskConical size={48} className="text-slate-300 mb-3" />
                      <p className="text-sm font-medium">No collected orders</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {items.map((o: any) => (
                    <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
                        <div className="flex items-center gap-3">
                          <FlaskConical size={15} className="text-purple-500" />
                          <span className="text-sm font-semibold text-slate-800">{o.test_name}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${statusStyles[o.status] || 'bg-slate-100 text-slate-600'}`}>
                            {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                          </span>
                          {o.priority && o.priority !== 'routine' && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${o.priority === 'stat' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {o.priority.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">{new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{o.patient_name || 'Walk-in Patient'}</p>
                          {o.lab_number && <p className="text-xs text-slate-400 font-mono">
                            {o.request_number ? `#${o.request_number} / ${o.order_number}` : `#${o.lab_number}`}
                          </p>}
                          <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            {o.specimen_type && <span>Specimen: {o.specimen_type}</span>}
                            {o.doctor_name && <span> &middot; Requested by: {o.doctor_name}</span>}
                            {o.referred_by && <span> &middot; Referred by: {o.referred_by}</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Pagination page={pendingPage} totalPages={totalPages} onChange={setPendingPage} />
                </div>
              )}
            </div>
          )
        })()
      )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-4">
          {historyResults.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-slate-400">
              <Clock size={48} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No lab history yet</p>
            </div>
          ) : (() => {
            const { items, totalPages } = usePagination(historyResults, historyPage)
            return (
              <div className="space-y-4">
                <div className="space-y-3">
                  {items.map((h: any) => (
                    <div key={h.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{h.test_name}</span>
                          {h.result_number && <span className="text-xs text-slate-400 font-mono">#{h.result_number}</span>}
                          <span className="text-xs text-slate-400">{h.full_patient_name || h.patient_name || 'Unknown'}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{h.approved_at ? new Date(h.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                      <div className={`flex items-center justify-between p-3 rounded-xl text-sm ${h.is_abnormal ? 'bg-rose-50' : 'bg-slate-50'}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-700">{h.analyte_name}</span>
                          <span className={`font-bold ${h.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{h.value}</span>
                          <span className="text-xs text-slate-400">Ref: {h.reference_range_low || '?'}–{h.reference_range_high || '?'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {h.is_abnormal && <AlertTriangle size={14} className="text-rose-500" />}
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-medium">Approved</span>
                        </div>
                      </div>
                      {h.approved_by_name && <p className="text-[11px] text-slate-400 mt-1">Approved by {h.approved_by_name}</p>}
                    </div>
                  ))}
                </div>
                <Pagination page={historyPage} totalPages={totalPages} onChange={setHistoryPage} />
              </div>
            )
          })()}
        </div>
      )}

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-5">
          {/* Pending Paypoint Payments */}
          {pendingOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Paid via Paypoint — Awaiting Lab Order Creation</h3>
              <div className="space-y-3">
                {(() => {
                  var grouped: Record<string, any> = {}
                  pendingOrders.forEach(function(item: any) {
                    var key = item.payment_id
                    if (!grouped[key]) grouped[key] = { payment_id: item.payment_id, receipt_number: item.receipt_number, walkin_name: item.walkin_name, walkin_phone: item.walkin_phone, created_at: item.created_at, items: [] }
                    grouped[key].items.push(item)
                  })
                  return Object.values(grouped).map(function(group: any) {
                    var allConverted = group.items.every(function(i: any) { return i.is_converted })
                    return (
                      <div key={group.payment_id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{group.walkin_name || 'Patient'}</p>
                            <p className="text-xs text-slate-400">Ref: {group.receipt_number} &middot; {group.walkin_phone ? 'Tel: ' + group.walkin_phone : ''}</p>
                          </div>
                          {allConverted ? (
                            <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium">Converted</span>
                          ) : (
                            <button onClick={function() { setConvertModal(group) }} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">Create Lab Order</button>
                          )}
                        </div>
                        <div className="px-5 py-3 space-y-1">
                          {group.items.map(function(item: any) {
                            return <div key={item.item_id} className="flex justify-between text-sm"><span className="text-slate-600">{item.description}</span><span className="text-xs text-slate-400">₦{parseFloat(item.unit_price || 0).toLocaleString()}</span></div>
                          })}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          )}

          {/* Unpaid Lab Orders */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Unpaid Lab Orders ({orders.filter(function(o: any) { return o.is_paid === false }).length})</h3>
            {orders.filter(function(o: any) { return o.is_paid === false }).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">All lab orders have been paid for.</p>
            ) : (
              <div className="space-y-2">
                {orders.filter(function(o: any) { return o.is_paid === false }).map(function(o: any) {
                  return (
                    <div key={o.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-rose-50 border border-rose-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{o.test_name}</p>
                        <p className="text-xs text-slate-500">{o.patient_name || 'Walk-in'} &middot; {o.lab_number || ''}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-xs font-medium flex-shrink-0 ml-3">Awaiting Payment</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Convert Payment to Lab Order Modal */}
      {convertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!converting) setConvertModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FlaskConical size={18} className="text-purple-500" /> Create Lab Orders</h2>
              <button onClick={() => setConvertModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Patient: <strong>{convertModal.walkin_name || 'Walk-in Patient'}</strong></p>
              {convertModal.walkin_phone && <p className="text-sm text-slate-600">Phone: {convertModal.walkin_phone}</p>}
              <p className="text-xs text-slate-400">Receipt: {convertModal.receipt_number}</p>
              <div className="space-y-1 mt-2">
                {convertModal.items.filter(function(i: any) { return !i.is_converted }).map(function(item: any) {
                  return <div key={item.item_id} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">{item.description}</div>
                })}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Specimen Type</label>
                  <select id="convertSpecimen" defaultValue="Blood"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option>Blood</option><option>Urine</option><option>Stool</option><option>Sputum</option><option>CSF</option><option>Swab</option><option>Tissue</option><option>Serum</option><option>Plasma</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                  <select id="convertPriority" defaultValue="routine"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setConvertModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={async function() {
                setConverting(true)
                try {
                  var specimen = (document.getElementById('convertSpecimen') as HTMLSelectElement)?.value || 'Blood'
                  var priority = (document.getElementById('convertPriority') as HTMLSelectElement)?.value || 'routine'
                  var items = convertModal.items.filter(function(i: any) { return !i.is_converted })
                  for (var item of items) {
                    await api.post('/lab-orders', {
                      patient_name: convertModal.walkin_name || 'Walk-in Patient',
                      patient_phone: convertModal.walkin_phone || null,
                      test_name: item.description,
                      specimen_type: specimen,
                      priority: priority,
                      payment_id: convertModal.payment_id,
                    })
                  }
                  var itemIds = items.map(function(i: any) { return i.item_id })
                  await api.put('/payments/items/convert', { item_ids: itemIds })
                  var res = await api.get('/payments/pending-orders?service_type=lab')
                  setPendingOrders(res.data || [])
                  setConvertModal(null)
                } catch (err: any) { alert(err.response?.data?.message || 'Failed to create lab orders') }
                finally { setConverting(false) }
              }} disabled={converting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {converting ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                {converting ? 'Creating...' : 'Create & Add to Worklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Request Modal */}
      {showDirectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!walkinSubmitting) setShowDirectRequest(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Plus size={18} className="text-primary" /> Direct Lab Request</h2>
              <button onClick={() => { setShowDirectRequest(false); setSelectedTests([]); setWalkinForm({ patient_name: '', patient_phone: '', specimen_type: '', priority: 'routine', referred_by: '' }) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Patient Name *</label>
                  <input type="text" placeholder="e.g. John Doe" value={walkinForm.patient_name}
                    onChange={(e) => setWalkinForm((p) => ({ ...p, patient_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
                  <input type="text" placeholder="Optional" value={walkinForm.patient_phone}
                    onChange={(e) => setWalkinForm((p) => ({ ...p, patient_phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              <div className="relative">
                <label className="block text-xs font-medium text-slate-500 mb-1">Tests / Investigations *</label>
                {selectedTests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedTests.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium">
                        <span>{t.name}</span>
                        <span className="text-purple-400">|</span>
                        <select value={t.specimen_type || ''} onChange={(e) => setSelectedTests((prev) => prev.map((st, j) => j === i ? { ...st, specimen_type: e.target.value } : st))}
                          className="bg-transparent text-purple-600 outline-none text-[10px] font-medium cursor-pointer" onClick={(e) => e.stopPropagation()}>
                          <option value="">Specimen</option>
                          {SPECIMEN_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button type="button" onClick={() => setSelectedTests((prev) => prev.filter((_, j) => j !== i))} className="hover:text-purple-900 ml-0.5"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" placeholder="Search and add tests..." value={testSearch}
                    onChange={(e) => { setTestSearch(e.target.value); setShowTestDropdown(true) }}
                    onFocus={() => setShowTestDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTestDropdown(false), 200)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
                {showTestDropdown && testSearch.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                    {testCatalog.filter((t: any) => t.name.toLowerCase().includes(testSearch.toLowerCase())).slice(0, 10).map((t: any) => (
                      <button key={t.id} type="button" onMouseDown={() => {
                        if (!selectedTests.find((s) => s.name === t.name)) {
                          setSelectedTests((prev) => [...prev, { name: t.name, specimen_type: t.specimen_type }])
                        }
                        setTestSearch('')
                        setShowTestDropdown(false)
                      }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors flex items-center justify-between">
                        <span>{t.name}</span>
                        <span className="text-xs text-slate-400">{t.category} — ${Number(t.price).toFixed(2)}</span>
                      </button>
                    ))}
                    {testCatalog.filter((t: any) => t.name.toLowerCase().includes(testSearch.toLowerCase())).length === 0 && (
                      <div className="px-4 py-2.5 text-sm text-slate-400">No matching tests</div>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                  <select value={walkinForm.priority} onChange={(e) => setWalkinForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary outline-none">
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Referred By</label>
                  <input type="text" placeholder="Doctor name (optional)" value={walkinForm.referred_by}
                    onChange={(e) => setWalkinForm((p) => ({ ...p, referred_by: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => { setShowDirectRequest(false); setSelectedTests([]); setWalkinForm({ patient_name: '', patient_phone: '', specimen_type: '', priority: 'routine', referred_by: '' }) }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleWalkinSubmit} disabled={walkinSubmitting || selectedTests.length === 0 || !walkinForm.patient_name || !walkinForm.patient_phone?.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {walkinSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {walkinSubmitting ? 'Submitting...' : `Submit ${selectedTests.length} Test${selectedTests.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analyte Entry Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setSelectedOrder(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <FlaskConical size={18} className="text-purple-500" /> {selectedOrder.test_name}
              </h2>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-sm text-slate-500">Patient: <strong>{selectedOrder.patient_name || 'Walk-in Patient'}</strong>
                {selectedOrder.lab_number && <span className="text-slate-400 font-mono ml-2">#{selectedOrder.lab_number}</span>}
              </p>
              {analytes.map((a, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Analyte {idx + 1}</span>
                    {analytes.length > 1 && (
                      <button onClick={() => removeAnalyte(idx)} className="text-rose-400 hover:text-rose-600 p-0.5"><X size={14} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Analyte name" value={a.name}
                      onChange={(e) => updateAnalyte(idx, 'name', e.target.value)}
                      className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    <input type="text" placeholder="Value" value={a.value}
                      onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <input type="text" placeholder="Ref low" value={a.refLow}
                        onChange={(e) => updateAnalyte(idx, 'refLow', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                      <span>–</span>
                      <input type="text" placeholder="Ref high" value={a.refHigh}
                        onChange={(e) => updateAnalyte(idx, 'refHigh', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm focus:ring-2 focus:ring-primary outline-none" />
                    </div>
                  </div>
                  {a.refLow && a.refHigh && a.value && (
                    <p className={`text-xs ${(parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh)) ? 'text-rose-600 font-medium' : 'text-emerald-600'}`}>
                      {(parseFloat(a.value) < parseFloat(a.refLow) || parseFloat(a.value) > parseFloat(a.refHigh)) ? '⚠ Abnormal' : '✓ Within range'}
                    </p>
                  )}
                </div>
              ))}
              <button onClick={addAnalyte}
                className="flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                <Plus size={14} /> Add another analyte
              </button>
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

      {/* Result Print Modal */}
      {printModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-primary" /> Lab Result</h2>
              <button onClick={() => setPrintModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800">SRETAN EMR</h3>
                <p className="text-xs text-slate-400">Laboratory Report</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 flex items-center gap-2">
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
                const txt = `SRETAN EMR - Laboratory Report\n#${printModal.lab_number || ''}\nPatient: ${printModal.patient_name || 'Walk-in Patient'}\nTest: ${printModal.test_name}\nSpecimen: ${printModal.specimen_type || '—'}\nDate: ${new Date(printModal.created_at).toLocaleString()}\nStatus: ${printModal.status}\n${resultsTxt ? '\nResults:\n' + resultsTxt : ''}`
                navigator.clipboard?.writeText(txt)
                setPrintModal(null)
              }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors">Copy</button>
              <button onClick={() => setPrintModal(null)} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Done</button>
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
    </div>
  )
}
