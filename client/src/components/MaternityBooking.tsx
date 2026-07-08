import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Baby, Search, Loader2, ArrowLeft, X, CheckCircle, ChevronRight } from 'lucide-react'

export default function MaternityBooking() {
  const navigate = useNavigate()
  const [femalePatients, setFemalePatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25
  const [showModal, setShowModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [form, setForm] = useState<any>({ gravida: 1, para: 0, living_children: 0, miscarriages: 0, baby_alive: 0, risk_level: 'low' })
  const [submitting, setSubmitting] = useState(false)
  const [staffId, setStaffId] = useState('')

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setStaffId(JSON.parse(u).id || '') } catch {}
  }, [])

  async function loadPatients() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('available_female', 'true')
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (search) params.append('search', search)
      const res = await fetch(`/api/maternity-patients?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setFemalePatients(Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadPatients() }, [page])

  function handleSearch() { setPage(1); loadPatients() }

  const totalPages = Math.ceil(total / limit)
  function calcEGA(lmp: string): { weeks: number; days: number; weeksText: string } {
    if (!lmp) return { weeks: 0, days: 0, weeksText: '' }
    const ms = Date.now() - new Date(lmp).getTime()
    const weeks = Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)))
    const days = Math.max(0, Math.floor((ms % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000)))
    return { weeks, days, weeksText: `${weeks}w ${days}d` }
  }
  const ega = calcEGA(form.lmp)
  const filtered = femalePatients

  function openBooking(patient: any) {
    setSelectedPatient(patient)
    const prevPregs = patient.previous_pregnancies || 0
    const nextGravida = Math.max(1, prevPregs + 1)
    setForm({ gravida: nextGravida, para: 0, living_children: 0, miscarriages: 0, baby_alive: 0, risk_level: 'low' })
    setShowModal(true)
  }

  async function handleSubmit() {
    if (!selectedPatient) return
    setSubmitting(true)
    try {
      await fetch('/api/maternity-patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({
          ...form,
          patient_id: selectedPatient.id,
          booked_by: staffId,
        }),
      })
      setShowModal(false)
      setSelectedPatient(null)
      loadPatients()
    } catch (err) { alert('Booking failed') } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center"><Baby size={22} className="text-pink-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Book Pregnancy</h1>
          <p className="text-sm text-slate-500">Register a female patient for antenatal care</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search female patients by name or hospital #..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Baby size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No available female patients</p>
          <p className="text-xs mt-1">All patients may already have an active pregnancy</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((patient) => (
            <div key={patient.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center"><Baby size={18} className="text-pink-600" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{patient.full_name}</p>
                  <p className="text-xs text-slate-400">{patient.hospital_number} &middot; {patient.phone || '—'}</p>
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-1 mb-3">
                <p>DOB: {patient.dob?.slice(0, 10) || '—'} &middot; {patient.marital_status || '—'}</p>
                {patient.blood_type && <p>Blood Type: {patient.blood_type}</p>}
              </div>
              <button onClick={() => openBooking(patient)}
                className="w-full py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                Book Pregnancy
              </button>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!submitting) setShowModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Book Pregnancy — {selectedPatient?.full_name}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
                Patient: {selectedPatient?.full_name} | Hospital #: {selectedPatient?.hospital_number} | DOB: {selectedPatient?.dob?.slice(0, 10)}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Last Menstrual Period (LMP)</label>
                  <input type="date" value={form.lmp || ''}
                    onChange={(e) => setForm((p: any) => ({ ...p, lmp: e.target.value, edd: e.target.value ? new Date(new Date(e.target.value).getTime() + 280 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : '' }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Estimated Gestational Age (from LMP)</label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl px-4 py-2.5">
                      {form.lmp ? (
                        <p className="text-lg font-bold text-purple-700">{ega.weeksText}</p>
                      ) : (
                        <p className="text-sm text-slate-400">Enter LMP to calculate</p>
                      )}
                    </div>
                    {form.lmp && <p className="text-[10px] text-slate-400 self-end pb-1">Auto-calculated &middot; Updates daily</p>}
                  </div>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Estimated Delivery Date (EDD)</label>
                  <input type="date" value={form.edd || ''}
                    onChange={(e) => setForm((p: any) => ({ ...p, edd: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Gestational Age at Booking (weeks)</label>
                  <div className="flex gap-2">
                    <input type="number" value={form.booking_gestational_age || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, booking_gestational_age: parseInt(e.target.value) || '' }))}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                    {form.lmp && ega.weeks > 0 && (
                      <button type="button" onClick={() => setForm((p: any) => ({ ...p, booking_gestational_age: ega.weeks }))}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 text-xs font-medium hover:bg-purple-100 whitespace-nowrap transition-colors">
                        <ChevronRight size={12} /> Use EGA
                      </button>
                    )}
                    {form.edd && (
                      <button type="button" onClick={() => {
                        const weeksUntilEdd = Math.max(0, Math.floor((new Date(form.edd).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
                        const gaFromEdd = Math.max(0, 40 - weeksUntilEdd)
                        setForm((p: any) => ({ ...p, booking_gestational_age: gaFromEdd }))
                      }}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100 whitespace-nowrap transition-colors">
                        <ChevronRight size={12} /> Use EDD
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Gravida <span className="text-rose-500">*</span></label>
                  <input type="number" min="1" value={form.gravida || 1}
                    onChange={(e) => setForm((p: any) => ({ ...p, gravida: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Para <span className="text-rose-500">*</span></label>
                  <input type="number" min="0" value={form.para || 0}
                    onChange={(e) => setForm((p: any) => ({ ...p, para: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Living Children</label>
                  <input type="number" min="0" value={form.living_children || 0}
                    onChange={(e) => setForm((p: any) => ({ ...p, living_children: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Miscarriages</label>
                  <input type="number" min="0" value={form.miscarriages ?? 0}
                    onChange={(e) => setForm((p: any) => ({ ...p, miscarriages: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Number of Babies Alive</label>
                  <input type="number" min="0" value={form.baby_alive ?? 0}
                    onChange={(e) => setForm((p: any) => ({ ...p, baby_alive: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Blood Group</label>
                  <select value={form.blood_group || ''} onChange={(e) => setForm((p: any) => ({ ...p, blood_group: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                    <option value="O">O</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Genotype</label>
                  <select value={form.genotype || ''} onChange={(e) => setForm((p: any) => ({ ...p, genotype: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="AA">AA</option>
                    <option value="AS">AS</option>
                    <option value="SS">SS</option>
                    <option value="AC">AC</option>
                    <option value="SC">SC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Rh Factor</label>
                  <select value={form.rh_factor || ''} onChange={(e) => setForm((p: any) => ({ ...p, rh_factor: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="Positive">Positive</option>
                    <option value="Negative">Negative</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">HIV Status</label>
                  <select value={form.hiv_status || ''} onChange={(e) => setForm((p: any) => ({ ...p, hiv_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="Non-reactive">Non-reactive</option>
                    <option value="Reactive">Reactive</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">HBV Status</label>
                  <select value={form.hbv_status || ''} onChange={(e) => setForm((p: any) => ({ ...p, hbv_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="">Select</option>
                    <option value="Non-reactive">Non-reactive</option>
                    <option value="Reactive">Reactive</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Risk Level</label>
                  <select value={form.risk_level || 'low'} onChange={(e) => setForm((p: any) => ({ ...p, risk_level: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none">
                    <option value="low">Low</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Risk Factors / Notes</label>
                <textarea rows={3} value={form.risk_factors || ''}
                  onChange={(e) => setForm((p: any) => ({ ...p, risk_factors: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {submitting ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
