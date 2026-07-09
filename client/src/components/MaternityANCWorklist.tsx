import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Search, Loader2, ArrowLeft, Plus, X, CheckCircle, Activity, AlertTriangle, Baby, Clock, Users, PenLine, Stethoscope, FlaskConical, ScanLine, Pill } from 'lucide-react'

function daysUntil(date: string): number {
  if (!date) return 999
  return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

export default function MaternityANCWorklist() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [staffId, setStaffId] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [patientVisits, setPatientVisits] = useState<any[]>([])
  const [patientEncounters, setPatientEncounters] = useState<any[]>([])
  const [combinedTimeline, setCombinedTimeline] = useState<any[]>([])
  const [ancForm, setAncForm] = useState<any>({})
  const [ancSubmitting, setAncSubmitting] = useState(false)
  const [stats, setStats] = useState<any>({})

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setStaffId(JSON.parse(u).id || '') } catch {}
    fetch('/api/maternity-patients/stats', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })
      .then((r) => r.json()).then((d) => setStats(d)).catch(() => {})
  }, [])

  async function loadPatients() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('status', 'active')
      params.append('page', String(page))
      params.append('limit', String(limit))
      if (search) params.append('search', search)
      const res = await fetch(`/api/maternity-patients?${params.toString()}`, {
        headers: { 'x-master-token': 'sretan-emr-master-token-2026' }
      })
      const data = await res.json()
      setPatients(Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadPatients() }, [page])

  const totalPages = Math.ceil(total / limit)

  function handleSearch() { setPage(1); loadPatients() }

  async function openVisitHistory(patient: any) {
    setSelectedPatient(patient)
    try {
      const compJson = await (await fetch(`/api/antenatal-visits/comprehensive/${patient.id}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } })).json()
      const comp = Array.isArray(compJson) ? compJson : []
      setCombinedTimeline(comp)
      // Count totals for summary
      let ancTotal = 0, encTotal = 0
      comp.forEach((g: any) => { ancTotal += g.anc_visits?.length || 0; encTotal += g.encounters?.length || 0 })
      setPatientVisits(new Array(ancTotal))
      setPatientEncounters(new Array(encTotal))
      setShowHistoryModal(true)
    } catch {}
  }

  async function handleANCSubmit() {
    if (!selectedPatient) return
    setAncSubmitting(true)
    try {
      await fetch('/api/antenatal-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-master-token': 'sretan-emr-master-token-2026' },
        body: JSON.stringify({ ...ancForm, maternity_patient_id: selectedPatient.id, staff_id: staffId }),
      })
      setShowVisitModal(false)
      setAncForm({})
      loadPatients()
    } catch {} finally { setAncSubmitting(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/maternity')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Calendar size={22} className="text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">ANC Visits</h1>
          <p className="text-sm text-slate-500">Antenatal care visit management</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Users size={18} className="text-purple-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.active_pregnancies ?? '—'}</p>
              <p className="text-xs text-slate-400">Active Patients</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle size={18} className="text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.overdue_anc ?? '—'}</p>
              <p className="text-xs text-slate-400">Overdue ANC</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center"><Activity size={18} className="text-red-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.high_risk_pregnancies ?? '—'}</p>
              <p className="text-xs text-slate-400">High Risk</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Calendar size={18} className="text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{stats.due_this_week ?? '—'}</p>
              <p className="text-xs text-slate-400">Due This Week</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search & filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search patients..." value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
        </div>
        <button onClick={handleSearch}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium">Search</button>
        <span className="text-xs text-slate-400 ml-auto">{total} patient{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>
      ) : patients.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-slate-400">
          <Calendar size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No active maternity patients found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Patient</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">EDD / Gest. Age</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Visits</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Next Appt</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Risk</th>
                    <th className="text-center px-4 py-3 font-medium text-slate-500 text-xs"></th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => {
                    const ga = p.edd ? Math.max(0, 40 - Math.floor((new Date(p.edd).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000))) : 0
                    const overdue = p.next_appointment_date && daysUntil(p.next_appointment_date) < 0
                    const dueIn = daysUntil(p.edd)
                    return (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{p.full_name}</p>
                          <p className="text-xs text-slate-400">{p.hospital_number}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs">{p.edd?.slice(0, 10) || '—'}</span>
                          <span className="text-xs text-slate-400 ml-2">{ga > 0 ? `(${ga}w)` : ''}</span>
                          {p.edd && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              dueIn < 0 ? 'bg-red-100 text-red-700' : dueIn <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                            }`}>{dueIn < 0 ? `${Math.abs(dueIn)}d overdue` : `in ${dueIn}d`}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{p.visit_count || 0}</td>
                        <td className="px-4 py-3">
                          {p.next_appointment_date ? (
                            <span className={`text-xs ${overdue ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                              {p.next_appointment_date?.slice(0, 10)}
                              {overdue && ' (overdue)'}
                            </span>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            p.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}>{p.risk_level}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1.5 justify-center">
                            <button onClick={() => openVisitHistory(p)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[10px] font-medium hover:bg-slate-50">History</button>
                            <button onClick={() => { setSelectedPatient(p); setAncForm({ visit_date: new Date().toISOString().slice(0, 10) }); setShowVisitModal(true) }}
                              className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-[10px] font-medium">+ Visit</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* Pagination */}
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
        </>
      )}

      {/* Visit History Modal — Comprehensive */}
      {showHistoryModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Calendar size={16} className="text-purple-500" /> Care History — {selectedPatient.full_name}</h2>
              <button onClick={() => setShowHistoryModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {combinedTimeline.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Calendar size={36} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">No ANC visits or consultations recorded</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {combinedTimeline.map((group: any, gi: number) => {
                    const totalItems = (group.anc_visits?.length || 0) + (group.encounters?.length || 0)
                    return (
                    <div key={gi}>
                      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-white z-10 pb-1">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-xs font-bold text-slate-700">{new Date(group.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <div className="flex gap-1.5 ml-auto">
                          {group.anc_visits?.length > 0 && <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium">{group.anc_visits.length} ANC</span>}
                          {group.encounters?.length > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{group.encounters.length} Consult</span>}
                          {group.lab_orders?.length > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">{group.lab_orders.length} Lab</span>}
                          {group.radiology_orders?.length > 0 && <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-medium">{group.radiology_orders.length} Rad</span>}
                          {group.prescriptions?.length > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium">{group.prescriptions.length} Rx</span>}
                        </div>
                      </div>
                      <div className="space-y-2 pl-4">
                        {/* ANC Visit Cards */}
                        {group.anc_visits?.map((v: any, idx: number) => (
                          <div key={v.id || idx} className="bg-purple-50 rounded-xl p-4 space-y-1.5 border border-purple-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-purple-700">ANC Visit #{v.visit_number}</span>
                              {v.gestational_age_weeks && <span className="text-[10px] text-purple-500">{v.gestational_age_weeks}w</span>}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                              {v.weight && <div><span className="text-slate-400">WT:</span> {v.weight}kg</div>}
                              {v.systolic_bp && <div><span className="text-slate-400">BP:</span> {v.systolic_bp}/{v.diastolic_bp || '—'}</div>}
                              {v.fundal_height && <div><span className="text-slate-400">FH:</span> {v.fundal_height}cm</div>}
                              {v.fetal_heart_rate && <div><span className="text-slate-400">FHR:</span> {v.fetal_heart_rate}</div>}
                              {v.fetal_presentation && <div><span className="text-slate-400">Pres:</span> {v.fetal_presentation}</div>}
                              {v.hemoglobin && <div><span className="text-slate-400">Hb:</span> {v.hemoglobin}g/dL</div>}
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[10px]">
                              {v.iycf_given && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Iron/Folate</span>}
                              {v.tt_dose && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">TT {v.tt_dose}</span>}
                              {v.next_appointment_date && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Next: {v.next_appointment_date?.slice(0, 10)}</span>}
                            </div>
                            {v.notes && <p className="text-[11px] text-slate-500 mt-1">{v.notes}</p>}
                          </div>
                        ))}
                        {/* Encounter Cards */}
                        {group.encounters?.filter((enc: any) => {
                          const sn = typeof enc.soap_notes === 'string' ? (() => { try { return JSON.parse(enc.soap_notes) } catch { return null } })() : enc.soap_notes
                          return sn && (sn.subjective || sn.objective || sn.assessment || sn.plan)
                        }).map((enc: any, idx: number) => (
                          <div key={enc.id || idx} className="bg-blue-50 rounded-xl p-4 space-y-2 border border-blue-100">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <PenLine size={13} className="text-blue-500" />
                                <span className="text-xs font-semibold text-blue-700">Consultation {enc.staff_name ? `— ${enc.staff_name}` : ''}</span>
                              </div>
                              {enc.created_at && <span className="text-[10px] text-slate-400">{new Date(enc.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                            </div>
                            {(() => {
                              const sn = typeof enc.soap_notes === 'string' ? (() => { try { return JSON.parse(enc.soap_notes) } catch { return null } })() : enc.soap_notes
                              return sn && (sn.subjective || sn.objective || sn.assessment || sn.plan) ? (
                                <div className="space-y-1 text-xs">
                                  {sn.subjective && <p><span className="text-slate-400 font-medium">S:</span> {sn.subjective}</p>}
                                  {sn.objective && <p><span className="text-slate-400 font-medium">O:</span> {sn.objective}</p>}
                                  {sn.assessment && <p><span className="text-slate-400 font-medium">A:</span> {sn.assessment}</p>}
                                  {sn.plan && <p><span className="text-slate-400 font-medium">P:</span> {sn.plan}</p>}
                                </div>
                              ) : null
                            })()}
                            {(() => {
                              const diag = typeof enc.diagnoses === 'string' ? (() => { try { return JSON.parse(enc.diagnoses) } catch { return [] } })() : enc.diagnoses
                              return Array.isArray(diag) && diag.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {diag.map((d: any, i: number) => <span key={i} className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-medium">{d.code && <span className="font-mono">{d.code} </span>}{d.label || d}</span>)}
                                </div>
                              ) : null
                            })()}
                          </div>
                        ))}
                        {/* Lab Orders */}
                        {group.lab_orders?.length > 0 && (
                          <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
                            <p className="text-[10px] font-semibold text-amber-700 uppercase flex items-center gap-1"><FlaskConical size={11} /> Lab Orders</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {group.lab_orders.map((o: any) => (
                                <span key={o.id} className="px-2 py-0.5 rounded bg-white text-amber-700 text-[10px] font-medium border border-amber-200">{o.test_name} <span className="text-amber-400">({o.status || 'pending'})</span></span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Radiology Orders */}
                        {group.radiology_orders?.length > 0 && (
                          <div className="bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
                            <p className="text-[10px] font-semibold text-indigo-700 uppercase flex items-center gap-1"><ScanLine size={11} /> Radiology Orders</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {group.radiology_orders.map((o: any) => (
                                <span key={o.id} className="px-2 py-0.5 rounded bg-white text-indigo-700 text-[10px] font-medium border border-indigo-200">{o.imaging_type} <span className="text-indigo-400">({o.status || 'pending'})</span></span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Prescriptions */}
                        {group.prescriptions?.length > 0 && (
                          <div className="bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
                            <p className="text-[10px] font-semibold text-emerald-700 uppercase flex items-center gap-1"><Pill size={11} /> Prescriptions</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {group.prescriptions.map((o: any) => (
                                <span key={o.id} className="px-2 py-0.5 rounded bg-white text-emerald-700 text-[10px] font-medium border border-emerald-200">{o.drug_name}{o.dosage ? ` ${o.dosage}` : ''} <span className="text-emerald-400">({o.status || 'prescribed'})</span></span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
              {/* Summary */}
              {combinedTimeline.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  <span>Total visits: <strong>{combinedTimeline.reduce((s: number, g: any) => s + (g.anc_visits?.length || 0) + (g.encounters?.length || 0), 0)}</strong></span>
                  <span>ANC: <strong>{patientVisits.length}</strong></span>
                  <span>Consultations: <strong>{patientEncounters.length}</strong></span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end flex-shrink-0">
              <button onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Visit Modal */}
      {showVisitModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!ancSubmitting) setShowVisitModal(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-800">Record ANC Visit — {selectedPatient.full_name}</h2>
              <button onClick={() => setShowVisitModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Visit Date</label>
                  <input type="date" value={ancForm.visit_date || ''}
                    onChange={(e) => setAncForm((p: any) => ({ ...p, visit_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </div>
                {[
                  { label: 'Weight (kg)', key: 'weight', type: 'number' },
                  { label: 'Systolic BP', key: 'systolic_bp', type: 'number' },
                  { label: 'Diastolic BP', key: 'diastolic_bp', type: 'number' },
                  { label: 'Fundal Height (cm)', key: 'fundal_height', type: 'number' },
                  { label: 'Fetal Presentation', key: 'fetal_presentation', type: 'select', options: ['', 'cephalic', 'breech', 'transverse'] },
                  { label: 'Fetal Heart Rate', key: 'fetal_heart_rate', type: 'number' },
                  { label: 'FH Sound', key: 'fetal_heart_sound', type: 'text' },
                  { label: 'Urine Protein', key: 'urine_protein', type: 'select', options: ['', 'negative', 'trace', '+1', '+2', '+3'] },
                  { label: 'Urine Glucose', key: 'urine_glucose', type: 'select', options: ['', 'negative', 'trace', '+1', '+2', '+3'] },
                  { label: 'Hemoglobin (g/dL)', key: 'hemoglobin', type: 'number' },
                  { label: 'PCV (%)', key: 'pcv', type: 'number' },
                  { label: 'TT Dose', key: 'tt_dose', type: 'select', options: ['', '1', '2', '3', '4', '5', 'completed'] },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                    {f.type === 'select' ? (
                      <select value={ancForm[f.key] || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-primary">
                        {(f.options || []).map((o: string) => <option key={o} value={o}>{o || 'Select'}</option>)}
                      </select>
                    ) : (
                      <input type={f.type} step="any" value={ancForm[f.key] || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={ancForm.iycf_given || false}
                    onChange={(e) => setAncForm((p: any) => ({ ...p, iycf_given: e.target.checked }))}
                    className="rounded border-slate-300" />
                  Iron/Folate Given
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Next Appointment Date</label>
                <input type="date" value={ancForm.next_appointment_date || ''}
                  onChange={(e) => setAncForm((p: any) => ({ ...p, next_appointment_date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} value={ancForm.notes || ''} onChange={(e) => setAncForm((p: any) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowVisitModal(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">Cancel</button>
              <button onClick={handleANCSubmit} disabled={ancSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50">
                {ancSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {ancSubmitting ? 'Saving...' : 'Save Visit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
