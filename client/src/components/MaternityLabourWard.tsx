import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Stethoscope, Activity, Loader2, ArrowLeft, Clock, Plus, X, CheckCircle, Baby, BarChart3, List, Search } from 'lucide-react'
import PartographChart from './PartographChart'

export default function MaternityLabourWard() {
  const navigate = useNavigate()
  const [activeLabours, setActiveLabours] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25
  const totalPages = Math.ceil(total / limit)
  const [tab, setTab] = useState('active')
  const [staffId, setStaffId] = useState('')

  // Active patient management
  const [selectedDelivery, setSelectedDelivery] = useState<any>(null)
  const [selectedPatientName, setSelectedPatientName] = useState('')
  const [partographData, setPartographData] = useState<any[]>([])
  const [newborns, setNewborns] = useState<any[]>([])

  // Partograph form
  const [showPartographModal, setShowPartographModal] = useState(false)
  const [partoForm, setPartoForm] = useState<any>({})

  // Delivery form
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState<any>({})

  // Newborn form
  const [showNewbornModal, setShowNewbornModal] = useState(false)
  const [newbornForm, setNewbornForm] = useState<any>({})

  const [submitting, setSubmitting] = useState(false)
  const [undoHistory, setUndoHistory] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])
  const [partoDataCache, setPartoDataCache] = useState<any[]>([])

  // Keep partograph data in sync
  useEffect(() => { setPartoDataCache(partographData) }, [partographData])

  function pushUndo(action: any) {
    setUndoHistory((h) => [...h, action])
    setRedoStack([])
  }

  async function handleAddEntry(hour: number, updates: any) {
    if (!selectedDelivery) return
    const admitted = selectedDelivery.admitted_at ? new Date(selectedDelivery.admitted_at).getTime() : Date.now()
    const recordedAt = new Date(admitted + hour * 60 * 60 * 1000).toISOString()
    try {
      const res = await fetch('/api/maternity-partograph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ ...updates, delivery_id: selectedDelivery.id, recorded_at: recordedAt, recorded_by: staffId }),
      })
      const created = await res.json()
      pushUndo({ type: 'add', entry: created, deliveryId: selectedDelivery.id })
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  async function handleDeleteEntry(entryId: string) {
    if (!selectedDelivery) return
    const entry = partoDataCache.find((p: any) => p.id === entryId)
    if (!entry) return
    try {
      await fetch(`/api/maternity-partograph/${entryId}`, {
        method: 'DELETE',
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' },
      })
      pushUndo({ type: 'delete', entry, deliveryId: selectedDelivery.id })
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  async function handleUndo() {
    if (undoHistory.length === 0 || !selectedDelivery) return
    const action = undoHistory[undoHistory.length - 1]
    try {
      if (action.type === 'add') {
        await fetch(`/api/maternity-partograph/${action.entry.id}`, {
          method: 'DELETE',
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' },
        })
      } else if (action.type === 'delete') {
        await fetch('/api/maternity-partograph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
          body: JSON.stringify({ ...action.entry, delivery_id: action.deliveryId, recorded_by: staffId }),
        })
      }
      setRedoStack((s) => [...s, action])
      setUndoHistory((h) => h.slice(0, -1))
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  async function handleRedo() {
    if (redoStack.length === 0 || !selectedDelivery) return
    const action = redoStack[redoStack.length - 1]
    try {
      if (action.type === 'add') {
        await fetch('/api/maternity-partograph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
          body: JSON.stringify({ ...action.entry, delivery_id: action.deliveryId, recorded_by: staffId }),
        })
      } else if (action.type === 'delete') {
        await fetch(`/api/maternity-partograph/${action.entry.id}`, {
          method: 'DELETE',
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' },
        })
      }
      setUndoHistory((h) => [...h, action])
      setRedoStack((s) => s.slice(0, -1))
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  async function handleClearAll() {
    if (!selectedDelivery || !window.confirm('Clear all partograph entries for this patient? This can be undone with Undo.')) return
    const entries = partoDataCache
    if (entries.length === 0) return
    try {
      for (const e of entries) {
        await fetch(`/api/maternity-partograph/${e.id}`, {
          method: 'DELETE',
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' },
        })
      }
      pushUndo({ type: 'clear', entries, deliveryId: selectedDelivery.id })
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  async function handleUpdateCell(hour: number, key: string, value: any) {
    if (!selectedDelivery) return
    const admitted = selectedDelivery.admitted_at ? new Date(selectedDelivery.admitted_at).getTime() : Date.now()
    const recordedAt = new Date(admitted + hour * 60 * 60 * 1000).toISOString()

    // Map PartoEntry keys to API fields
    const apiFieldMap: Record<string, string> = {
      fhr: 'fetal_heart_rate',
      cervix_cm: 'cervical_dilation',
      descent_0_5: 'descent',
      contractions: 'contractions_frequency',
      oxytocin: 'oxytocin',
      pulse: 'maternal_pulse',
      bp_sys: 'systolic_bp',
      bp_dia: 'diastolic_bp',
      temp: 'temperature',
      amniotic_fluid: 'amniotic_fluid',
      moulding: 'moulding',
      urine_protein: 'urine_protein',
      urine_acetone: 'urine_ketones',
      urine_volume: 'urine_volume',
      drugs_iv: 'drugs_given',
    }

    // Map value back for descent (WHO 0-5 → API -3 to 3)
    let mappedValue = value
    if (key === 'descent_0_5' && value != null) {
      mappedValue = value - 3
    }
    if (key === 'contractions' && value != null) {
      mappedValue = Math.max(1, Math.min(5, value))
    }
    const apiField = apiFieldMap[key] || key

    const existingEntry = partoDataCache.find((p: any) => {
      const eHour = Math.max(0, Math.round((new Date(p.recorded_at).getTime() - admitted) / (1000 * 60 * 60)))
      return eHour === hour
    })
    try {
      if (existingEntry) {
        await fetch(`/api/maternity-partograph/${existingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
          body: JSON.stringify({ [apiField]: mappedValue, recorded_by: staffId }),
        })
        pushUndo({ type: 'update', entryId: existingEntry.id, key: apiField, oldVal: existingEntry[apiField], newVal: mappedValue, deliveryId: selectedDelivery.id })
      } else {
        const res = await fetch('/api/maternity-partograph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
          body: JSON.stringify({ [apiField]: mappedValue, delivery_id: selectedDelivery.id, recorded_at: recordedAt, recorded_by: staffId }),
        })
        const created = await res.json()
        pushUndo({ type: 'add', entry: created, deliveryId: selectedDelivery.id })
      }
      loadPartograph(selectedDelivery.id)
    } catch {}
  }

  // Direct admit
  const [showAdmitModal, setShowAdmitModal] = useState(false)
  const [availablePatients, setAvailablePatients] = useState<any[]>([])
  const [admitForm, setAdmitForm] = useState<any>({})
  const [admitPatientSearch, setAdmitPatientSearch] = useState('')

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setStaffId(JSON.parse(u).id || '') } catch {}
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('status', 'active')
      params.append('page', String(page))
      params.append('limit', String(limit))
      const res = await fetch(`/api/maternity-deliveries?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setActiveLabours(Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [page])

  async function loadPartograph(deliveryId: string) {
    try {
      const res = await fetch(`/api/maternity-partograph?delivery_id=${deliveryId}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setPartographData(Array.isArray(data) ? data : [])
    } catch {}
  }

  async function loadAvailablePatients() {
    try {
      const res = await fetch('/api/maternity-patients?status=active', {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setAvailablePatients(Array.isArray(data) ? data : [])
    } catch {}
  }

  async function handlePartoSubmit() {
    if (!selectedDelivery) return
    setSubmitting(true)
    try {
      await fetch('/api/maternity-partograph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ ...partoForm, delivery_id: selectedDelivery.id, recorded_by: staffId }),
      })
      setPartoForm({})
      loadPartograph(selectedDelivery.id)
    } catch {} finally { setSubmitting(false) }
  }

  async function handleDeliveryComplete() {
    if (!selectedDelivery) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/maternity-deliveries/${selectedDelivery.id}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ ...deliveryForm, delivered_by: staffId }),
      })
      const updatedDelivery = await res.json()
      setSelectedDelivery(updatedDelivery)
      setShowDeliveryModal(false)
      loadData()
      setShowNewbornModal(true)
    } catch {} finally { setSubmitting(false) }
  }

  async function handleNewbornSubmit() {
    if (!selectedDelivery) return
    setSubmitting(true)
    try {
      await fetch('/api/maternity-newborns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ ...newbornForm, delivery_id: selectedDelivery.id }),
      })
      setNewbornForm({})
      alert('Newborn saved')
    } catch {} finally { setSubmitting(false) }
  }

  function openPatient(delivery: any) {
    setSelectedDelivery(delivery)
    setSelectedPatientName(delivery.patient_name || '')
    loadPartograph(delivery.id)
    setTab('manage')
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Stethoscope size={22} className="text-rose-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Labour & Delivery</h1>
          <p className="text-sm text-slate-500">Labour ward management</p>
        </div>
        <button onClick={() => navigate('/maternity/labour-summary')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
          <List size={15} /> Labour Summary
        </button>
        <button onClick={() => { setShowAdmitModal(true); loadAvailablePatients() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:scale-[1.01]">
          <Plus size={15} /> Admit Patient
        </button>
      </div>

      {tab === 'active' && (
        <div className="space-y-4">
          {activeLabours.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Activity size={48} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">No active labours</p>
              <p className="text-xs text-slate-400 mt-1">Admit a patient from their maternity chart to start</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeLabours.map((d) => (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center"><Baby size={18} className="text-rose-600" /></div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{d.patient_name}</p>
                        <p className="text-xs text-slate-400">{d.hospital_number}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 space-y-1">
                    {d.admitted_at && <p>Admitted: {new Date(d.admitted_at).toLocaleString()}</p>}
                    {d.labour_onset_at && <p>Labour onset: {new Date(d.labour_onset_at).toLocaleString()}</p>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => openPatient(d)}
                      className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-medium">Manage Labour</button>
                    <button onClick={() => navigate(`/maternity/patients/${d.maternity_patient_id}`)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium">Chart</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3">
              <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Previous</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'manage' && selectedDelivery && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">{selectedPatientName}</h2>
              <p className="text-xs text-slate-400">Delivery ID: {selectedDelivery.id?.slice(0, 8)}... | Status: <span className="text-amber-600 font-medium">In Labour</span></p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPartographModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium">
                <BarChart3 size={15} /> Partograph
              </button>
              <button onClick={() => { setDeliveryForm({}); setShowDeliveryModal(true) }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium">
                <CheckCircle size={15} /> Record Delivery
              </button>
            </div>
          </div>

          {/* Partograph Chart */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 overflow-x-auto">
            <PartographChart
              entries={partographData.map((p: any) => {
                const admitted = selectedDelivery?.admitted_at ? new Date(selectedDelivery.admitted_at).getTime() : Date.now()
                const recorded = new Date(p.recorded_at).getTime()
                const hour = Math.min(23, Math.max(0, Math.round((recorded - admitted) / (1000 * 60 * 60))))
                return {
                  _id: p.id,
                  hour,
                  time: new Date(p.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  fhr: p.fetal_heart_rate,
                  cervix_cm: p.cervical_dilation ? Number(p.cervical_dilation) : undefined,
                  descent_0_5: p.descent != null ? Math.max(0, Math.min(5, Number(p.descent) + 3)) : undefined,
                  contractions: p.contractions_frequency ? Math.min(5, Math.max(1, p.contractions_frequency)) as 1|2|3|4|5 : undefined,
                  oxytocin: p.oxytocin,
                  pulse: p.maternal_pulse,
                  bp_sys: p.systolic_bp,
                  bp_dia: p.diastolic_bp,
                  temp: p.temperature,
                  amniotic_fluid: p.amniotic_fluid,
                  moulding: p.moulding,
                  urine_protein: p.urine_protein,
                  urine_acetone: p.urine_ketones,
                  urine_volume: p.urine_volume,
                  drugs_iv: p.drugs_given,
                }
              })}
              patient={{
                name: selectedPatientName,
                gravida: selectedDelivery?.gravida ?? 0,
                para: selectedDelivery?.para ?? 0,
                hospital_number: selectedDelivery?.hospital_number || '',
                admission_date: selectedDelivery?.admitted_at ? new Date(selectedDelivery.admitted_at).toISOString().slice(0, 10) : '',
                admission_time: selectedDelivery?.admitted_at ? new Date(selectedDelivery.admitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
                ruptured_membranes_hours: selectedDelivery ? (selectedDelivery.rupture_of_membranes_at ? Math.round((new Date(selectedDelivery.admitted_at).getTime() - new Date(selectedDelivery.rupture_of_membranes_at).getTime()) / (1000 * 60 * 60)) : 0) : 0,
                hours_since_rupture: 0,
              }}
              editable={true}
              staffId={staffId}
              onUpdateEntry={handleUpdateCell}
              onDeleteEntry={handleDeleteEntry}
              onClearAll={handleClearAll}
              canUndo={undoHistory.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
        </div>
      )}

      {showPartographModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Partograph Entry — {selectedPatientName}</h2>
              <button onClick={() => setShowPartographModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Time <span className="text-rose-500">*</span></label>
                  <input type="datetime-local" value={partoForm.recorded_at || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, recorded_at: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Cervical Dilation (cm)</label>
                  <input type="number" step="0.5" min="0" max="10" value={partoForm.cervical_dilation || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, cervical_dilation: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Descent (Station)</label>
                  <input type="number" step="0.5" min="-3" max="3" value={partoForm.descent || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, descent: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contractions (/10 min)</label>
                  <input type="number" min="0" max="10" value={partoForm.contractions_frequency || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, contractions_frequency: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Duration (seconds)</label>
                  <input type="number" min="0" max="120" value={partoForm.contractions_duration || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, contractions_duration: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fetal Heart Rate</label>
                  <input type="number" min="60" max="200" value={partoForm.fetal_heart_rate || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, fetal_heart_rate: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Maternal Pulse</label>
                  <input type="number" value={partoForm.maternal_pulse || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, maternal_pulse: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Systolic BP</label>
                  <input type="number" value={partoForm.systolic_bp || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, systolic_bp: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Diastolic BP</label>
                  <input type="number" value={partoForm.diastolic_bp || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, diastolic_bp: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Drugs Given</label>
                  <input type="text" value={partoForm.drugs_given || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, drugs_given: e.target.value }))}
                    placeholder="e.g. Oxytocin 2mU/min, Pethidine 50mg IM"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Membranes / Moulding / Caput</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={partoForm.membranes || ''} onChange={(e) => setPartoForm((p: any) => ({ ...p, membranes: e.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                      <option value="">Membranes</option>
                      <option value="intact">Intact</option>
                      <option value="ruptured">Ruptured</option>
                      <option value="artificially_ruptured">ARM</option>
                    </select>
                    <select value={partoForm.moulding || ''} onChange={(e) => setPartoForm((p: any) => ({ ...p, moulding: e.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                      <option value="">Moulding</option>
                      <option value="none">None</option>
                      <option value="+">+</option>
                      <option value="++">++</option>
                      <option value="+++">+++</option>
                    </select>
                    <select value={partoForm.caput || ''} onChange={(e) => setPartoForm((p: any) => ({ ...p, caput: e.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                      <option value="">Caput</option>
                      <option value="none">None</option>
                      <option value="+">+</option>
                      <option value="++">++</option>
                      <option value="+++">+++</option>
                    </select>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                  <textarea rows={2} value={partoForm.notes || ''}
                    onChange={(e) => setPartoForm((p: any) => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none resize-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowPartographModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Close</button>
              <button onClick={handlePartoSubmit} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 text-white text-sm font-medium disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {submitting ? 'Saving...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeliveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Record Delivery — {selectedPatientName}</h2>
              <button onClick={() => setShowDeliveryModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Date <span className="text-rose-500">*</span></label>
                  <input type="date" value={deliveryForm.delivery_date || ''}
                    onChange={(e) => setDeliveryForm((p: any) => ({ ...p, delivery_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Time</label>
                  <input type="time" value={deliveryForm.delivery_time || ''}
                    onChange={(e) => setDeliveryForm((p: any) => ({ ...p, delivery_time: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Type <span className="text-rose-500">*</span></label>
                  <select value={deliveryForm.delivery_type || ''} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, delivery_type: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="SVD">SVD (Spontaneous Vertex Delivery)</option>
                    <option value="vacuum">Vacuum Extraction</option>
                    <option value="forceps">Forceps Delivery</option>
                    <option value="c_section">Caesarean Section</option>
                    <option value="breech">Breech Delivery</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Delivery Place</label>
                  <select value={deliveryForm.delivery_place || ''} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, delivery_place: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="labour_ward">Labour Ward</option>
                    <option value="theatre">Theatre</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Perineum</label>
                  <select value={deliveryForm.perineum_status || ''} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, perineum_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="intact">Intact</option>
                    <option value="tear_1st_degree">1st Degree Tear</option>
                    <option value="tear_2nd_degree">2nd Degree Tear</option>
                    <option value="tear_3rd_degree">3rd Degree Tear</option>
                    <option value="tear_4th_degree">4th Degree Tear</option>
                    <option value="episiotomy">Episiotomy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Placenta Delivery</label>
                  <select value={deliveryForm.placenta_delivery || ''} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, placenta_delivery: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="complete">Complete Spontaneous</option>
                    <option value="incomplete">Incomplete</option>
                    <option value="retained">Retained</option>
                    <option value="manual_removal">Manual Removal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Blood Loss (mL)</label>
                  <input type="number" value={deliveryForm.blood_loss_ml || ''}
                    onChange={(e) => setDeliveryForm((p: any) => ({ ...p, blood_loss_ml: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Outcome</label>
                  <select value={deliveryForm.outcome || 'live_birth'} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, outcome: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="live_birth">Live Birth</option>
                    <option value="stillbirth">Fresh Stillbirth</option>
                    <option value="macerated_stillbirth">Macerated Stillbirth</option>
                    <option value="miscarriage">Miscarriage</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={deliveryForm.oxytocin_given || false}
                      onChange={(e) => setDeliveryForm((p: any) => ({ ...p, oxytocin_given: e.target.checked }))}
                      className="rounded border-slate-300" />
                    Oxytocin Given (Active Management of Third Stage)
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Complication</label>
                  <select value={deliveryForm.complication || ''} onChange={(e) => setDeliveryForm((p: any) => ({ ...p, complication: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="none">None</option>
                    <option value="PPH">Postpartum Haemorrhage (PPH)</option>
                    <option value="pre_eclampsia">Pre-eclampsia</option>
                    <option value="eclampsia">Eclampsia</option>
                    <option value="cord_prolapse">Cord Prolapse</option>
                    <option value="shoulder_dystocia">Shoulder Dystocia</option>
                    <option value="uterine_rupture">Uterine Rupture</option>
                    <option value="perineal_tear">Perineal Tear (3rd/4th Degree)</option>
                    <option value="retained_placenta">Retained Placenta</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Complication Notes</label>
                  <textarea rows={2} value={deliveryForm.complication_notes || ''}
                    onChange={(e) => setDeliveryForm((p: any) => ({ ...p, complication_notes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Overall Delivery Notes</label>
                  <textarea rows={2} value={deliveryForm.notes || ''}
                    onChange={(e) => setDeliveryForm((p: any) => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none resize-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowDeliveryModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={handleDeliveryComplete} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Saving...' : 'Complete Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewbornModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Baby size={18} className="text-pink-500" /> Add Newborn</h2>
              <button onClick={() => setShowNewbornModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Baby Name</label>
                  <input type="text" value={newbornForm.baby_name || ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, baby_name: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Sex <span className="text-rose-500">*</span></label>
                  <select value={newbornForm.baby_sex || ''} onChange={(e) => setNewbornForm((p: any) => ({ ...p, baby_sex: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Birth Weight (kg) <span className="text-rose-500">*</span></label>
                  <input type="number" step="0.01" min="0.5" max="7" value={newbornForm.birth_weight || ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, birth_weight: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Birth Length (cm)</label>
                  <input type="number" step="0.1" value={newbornForm.birth_length || ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, birth_length: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Head Circumference (cm)</label>
                  <input type="number" step="0.1" value={newbornForm.head_circumference || ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, head_circumference: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Baby # (for twins)</label>
                  <input type="number" min="1" value={newbornForm.baby_number || 1}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, baby_number: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">APGAR 1 min</label>
                  <input type="number" min="0" max="10" value={newbornForm.apgar_1min ?? ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, apgar_1min: e.target.value !== '' ? parseInt(e.target.value) : null }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">APGAR 5 min</label>
                  <input type="number" min="0" max="10" value={newbornForm.apgar_5min ?? ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, apgar_5min: e.target.value !== '' ? parseInt(e.target.value) : null }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Resuscitation Required</label>
                  <select value={newbornForm.resuscitation || ''} onChange={(e) => setNewbornForm((p: any) => ({ ...p, resuscitation: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="none">None</option>
                    <option value="oxygen">Oxygen via Mask</option>
                    <option value="bag_mask">Bag & Mask Ventilation</option>
                    <option value="intubation">Intubation</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Congenital Anomalies</label>
                  <textarea rows={2} value={newbornForm.congenital_anomalies || ''}
                    onChange={(e) => setNewbornForm((p: any) => ({ ...p, congenital_anomalies: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none resize-none" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowNewbornModal(false); navigate('/maternity/labour-summary') }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Done / Summary</button>
              <button onClick={handleNewbornSubmit} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-pink-500 text-white text-sm font-medium disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {submitting ? 'Saving...' : 'Save Newborn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Admit Modal */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAdmitModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">Admit Patient for Labour</h2>
              <button onClick={() => setShowAdmitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search patients..." value={admitPatientSearch}
                  onChange={(e) => setAdmitPatientSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm outline-none" />
              </div>
              {availablePatients.filter((p) => !admitPatientSearch || p.full_name?.toLowerCase().includes(admitPatientSearch.toLowerCase()) || p.hospital_number?.toLowerCase().includes(admitPatientSearch.toLowerCase())).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
                    <p className="text-xs text-slate-400">{p.hospital_number} · EDD: {p.edd?.slice(0, 10) || '—'}</p>
                  </div>
                  <button onClick={async () => {
                    setSubmitting(true)
                    try {
                      const res = await fetch('/api/maternity-admit-labour', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
                        body: JSON.stringify({
                          maternity_patient_id: p.id,
                          admitted_at: new Date().toISOString(),
                          admitted_by: staffId,
                        }),
                      })
                      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Admission failed'); return }
                      setShowAdmitModal(false)
                      loadData()
                    } catch (err: any) { alert(err.message) } finally { setSubmitting(false) }
                  }} disabled={submitting}
                    className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-medium">Admit</button>
                </div>
              ))}
              {availablePatients.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No active maternity patients available</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
