import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Search, Loader2, ArrowLeft, Plus, X, CheckCircle, Baby, Calendar, Activity, AlertTriangle } from 'lucide-react'

export default function MaternityPostnatalWard() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25
  const totalPages = Math.ceil(total / limit)
  const [staffId, setStaffId] = useState('')
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [deliveryRecord, setDeliveryRecord] = useState<any>(null)
  const [postnatalVisits, setPostnatalVisits] = useState<any[]>([])
  const [showVisitsModal, setShowVisitsModal] = useState(false)
  const [visitForm, setVisitForm] = useState<any>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setStaffId(JSON.parse(u).id || '') } catch {}
  }, [])

  async function loadPatients() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('status', 'delivered')
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (search) params.append('search', search)
      const res = await fetch(`/api/maternity-patients?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      const list = Array.isArray(data) ? data : data?.rows || []
      setTotal(data.total || 0)
      // Fetch visit counts for each patient
      const withVisits = await Promise.all(list.map(async (p: any) => {
        try {
          const vRes = await fetch(`/api/maternity-deliveries?maternity_patient_id=${p.id}`, {
            headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
          })
          const dels = await vRes.json()
          const delivery = Array.isArray(dels) ? dels[0] : null
          let visitCount = 0
          if (delivery) {
            const pnRes = await fetch(`/api/postnatal-visits?delivery_id=${delivery.id}`, {
              headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
            })
            const pnData = await pnRes.json()
            visitCount = Array.isArray(pnData) ? pnData.length : 0
          }
          return { ...p, delivery_date: delivery?.delivery_date, delivery_type: delivery?.delivery_type, outcome: delivery?.outcome, delivery_id: delivery?.id, visit_count: visitCount }
        } catch { return { ...p, visit_count: 0 } }
      }))
      setPatients(withVisits)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadPatients() }, [page])

  function handleSearch() { setPage(1); loadPatients() }

  const filtered = patients

  const totalPatients = patients.length
  const totalVisits = patients.reduce((sum, p) => sum + (p.visit_count || 0), 0)
  const recentDeliveries = patients.filter((p) => {
    if (!p.delivery_date) return false
    const days = Math.ceil((Date.now() - new Date(p.delivery_date).getTime()) / (24 * 60 * 60 * 1000))
    return days <= 7
  }).length

  async function openVisitForm(patient: any) {
    setSelectedPatient(patient)
    setPostnatalVisits([])
    try {
      const res = await fetch(`/api/maternity-deliveries?maternity_patient_id=${patient.id}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const dels = await res.json()
      const delivery = Array.isArray(dels) ? dels[0] : null
      if (delivery) {
        setDeliveryRecord(delivery)
        const pnRes = await fetch(`/api/postnatal-visits?delivery_id=${delivery.id}`, {
          headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
        })
        const pnData = await pnRes.json()
        setPostnatalVisits(Array.isArray(pnData) ? pnData : [])
      }
    } catch {}
    setVisitForm({ visit_date: new Date().toISOString().slice(0, 10) })
    setShowVisitModal(true)
  }

  async function handleSubmit() {
    if (!deliveryRecord) return
    setSubmitting(true)
    try {
      await fetch('/api/postnatal-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({
          ...visitForm,
          delivery_id: deliveryRecord.id,
          visit_number: postnatalVisits.length + 1,
          staff_id: staffId,
        }),
      })
      setShowVisitModal(false)
      loadPatients()
    } catch {} finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center"><Heart size={22} className="text-teal-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Postnatal Care</h1>
          <p className="text-sm text-slate-500">Post-delivery follow-up visits</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center"><Heart size={18} className="text-teal-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalPatients}</p>
              <p className="text-xs text-slate-400">Delivered Patients</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Activity size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalVisits}</p>
              <p className="text-xs text-slate-400">Total Visits</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><Calendar size={18} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{recentDeliveries}</p>
              <p className="text-xs text-slate-400">Delivered ≤7d ago</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Baby size={18} className="text-purple-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{patients.filter((p) => p.visit_count === 0).length}</p>
              <p className="text-xs text-slate-400">No Visit Yet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search patients..." value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Heart size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No patients in postnatal care</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0"><Heart size={18} className="text-teal-600" /></div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{p.full_name}</p>
                      {p.visit_count === 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">No visit</span>}
                    </div>
                    <p className="text-xs text-slate-400">{p.hospital_number}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                      {p.delivery_date && <span>Delivered: {p.delivery_date?.slice(0, 10)}</span>}
                      {p.delivery_type && <span>Type: {p.delivery_type}</span>}
                      {p.outcome && <span>Outcome: {p.outcome}</span>}
                      <span>Visits: {p.visit_count}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => { setSelectedPatient(p); setPostnatalVisits([]); (async () => {
                    const res = await fetch(`/api/maternity-deliveries?maternity_patient_id=${p.id}`, {
                      headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
                    })
                    const dels = await res.json()
                    const delivery = Array.isArray(dels) ? dels[0] : null
                    if (delivery) {
                      const pnRes = await fetch(`/api/postnatal-visits?delivery_id=${delivery.id}`, {
                        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
                      })
                      const pnData = await pnRes.json()
                      const visits = Array.isArray(pnData) ? pnData : []
                      setPostnatalVisits(visits)
                      setDeliveryRecord(delivery)
                      setShowVisitsModal(true)
                    }
                  })()}}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">Visits</button>
                  <button onClick={() => openVisitForm(p)}
                    className="px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-medium hover:bg-teal-600 transition-colors flex items-center gap-1"><Plus size={12} /> Record</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}

      {/* Visit History Modal */}
      {showVisitsModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowVisitsModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Heart size={16} className="text-teal-500" /> Postnatal Visits — {selectedPatient.full_name}</h2>
              <button onClick={() => setShowVisitsModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {postnatalVisits.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Heart size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No postnatal visits recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {postnatalVisits.map((v: any, i: number) => (
                    <div key={v.id || i} className="bg-slate-50 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600">Visit #{v.visit_number} — {v.visit_date?.slice(0, 10) || '—'}</span>
                        {v.staff_name && <span className="text-[10px] text-slate-400">by {v.staff_name}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {v.fundal_height_cm && <div><span className="text-slate-400">FH:</span> {v.fundal_height_cm}cm</div>}
                        {v.lochia && <div><span className="text-slate-400">Lochia:</span> {v.lochia}</div>}
                        {v.systolic_bp && <div><span className="text-slate-400">BP:</span> {v.systolic_bp}/{v.diastolic_bp || '—'}</div>}
                        {v.pulse && <div><span className="text-slate-400">Pulse:</span> {v.pulse}</div>}
                        {v.temperature && <div><span className="text-slate-400">Temp:</span> {v.temperature}°C</div>}
                        {v.breastfeeding_status && <div className="col-span-3"><span className="text-slate-400">Feeding:</span> {v.breastfeeding_status}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        {v.breast_engorged && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Engorged</span>}
                        {v.breast_mastitis && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">Mastitis</span>}
                        {v.perineal_wound && v.perineal_wound !== 'N_A' && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Perineal: {v.perineal_wound}</span>}
                        {v.c_section_wound && v.c_section_wound !== 'N_A' && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">C/S: {v.c_section_wound}</span>}
                        {v.family_planning_discussed && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">FP: {v.family_planning_method || 'Discussed'}</span>}
                      </div>
                      {v.complications && <p className="text-xs text-rose-600">Complications: {v.complications}</p>}
                      {v.notes && <p className="text-xs text-slate-500">Notes: {v.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
              <button onClick={() => setShowVisitsModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Visit Modal */}
      {showVisitModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setShowVisitModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Heart size={16} className="text-teal-500" /> Postnatal Visit — {selectedPatient.full_name}</h2>
              <button onClick={() => setShowVisitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {postnatalVisits.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                  Previous visits: {postnatalVisits.length} — Visit #{postnatalVisits.length + 1}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Visit Date</label>
                  <input type="date" value={visitForm.visit_date || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, visit_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fundal Height (cm)</label>
                  <input type="number" step="0.1" value={visitForm.fundal_height_cm || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, fundal_height_cm: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Lochia</label>
                  <select value={visitForm.lochia || ''} onChange={(e) => setVisitForm((p: any) => ({ ...p, lochia: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="rubra_scant">Rubra (Scant)</option>
                    <option value="rubra_moderate">Rubra (Moderate)</option>
                    <option value="rubra_heavy">Rubra (Heavy)</option>
                    <option value="serosa_scant">Serosa (Scant)</option>
                    <option value="serosa_moderate">Serosa (Moderate)</option>
                    <option value="alba_scant">Alba (Scant)</option>
                    <option value="alba_moderate">Alba (Moderate)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Systolic BP</label>
                  <input type="number" value={visitForm.systolic_bp || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, systolic_bp: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Diastolic BP</label>
                  <input type="number" value={visitForm.diastolic_bp || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, diastolic_bp: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Pulse</label>
                  <input type="number" value={visitForm.pulse || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, pulse: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Temperature (°C)</label>
                  <input type="number" step="0.1" value={visitForm.temperature || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, temperature: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Breastfeeding</label>
                  <select value={visitForm.breastfeeding_status || ''} onChange={(e) => setVisitForm((p: any) => ({ ...p, breastfeeding_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="exclusive">Exclusive Breastfeeding</option>
                    <option value="mixed">Mixed</option>
                    <option value="formula">Formula Only</option>
                    <option value="not_established">Not Established</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Perineal Wound</label>
                  <select value={visitForm.perineal_wound || ''} onChange={(e) => setVisitForm((p: any) => ({ ...p, perineal_wound: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="healing">Healing</option>
                    <option value="infected">Infected</option>
                    <option value="dehiscence">Dehiscence</option>
                    <option value="N_A">N/A</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">C-Section Wound</label>
                  <select value={visitForm.c_section_wound || ''} onChange={(e) => setVisitForm((p: any) => ({ ...p, c_section_wound: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="healing">Healing</option>
                    <option value="infected">Infected</option>
                    <option value="dehiscence">Dehiscence</option>
                    <option value="N_A">N/A</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={visitForm.breast_engorged || false}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, breast_engorged: e.target.checked }))}
                    className="rounded border-slate-300" />
                  Engorged
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={visitForm.breast_mastitis || false}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, breast_mastitis: e.target.checked }))}
                    className="rounded border-slate-300" />
                  Mastitis
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={visitForm.family_planning_discussed || false}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, family_planning_discussed: e.target.checked }))}
                    className="rounded border-slate-300" />
                  FP Discussed
                </label>
              </div>
              {visitForm.family_planning_discussed && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Family Planning Method</label>
                  <input type="text" value={visitForm.family_planning_method || ''}
                    onChange={(e) => setVisitForm((p: any) => ({ ...p, family_planning_method: e.target.value }))}
                    placeholder="e.g. Condoms, Implant, IUD"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Complications</label>
                <textarea rows={2} value={visitForm.complications || ''}
                  onChange={(e) => setVisitForm((p: any) => ({ ...p, complications: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={2} value={visitForm.notes || ''}
                  onChange={(e) => setVisitForm((p: any) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowVisitModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-500 text-white text-sm font-medium disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Saving...' : 'Save Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
