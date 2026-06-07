import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import type { Patient, Encounter } from '../types'
import {
  User, Clock, Pill, Beaker, Scan, Activity, Loader2, Home,
  AlertTriangle, ChevronRight, ArrowLeft, Stethoscope, FlaskConical,
  FileText, X, Info
} from 'lucide-react'

async function fetchDoctorName(staffId: string): Promise<string> {
  try { const s = await api.get(`/staff/${staffId}`); return s.data?.name || 'Unknown Doctor' } catch { return 'Unknown Doctor' }
}

export default function PatientChart() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounters, setEncounters] = useState<any[]>([])
  const [rxList, setRxList] = useState<any[]>([])
  const [labOrders, setLabOrders] = useState<any[]>([])
  const [labResults, setLabResults] = useState<Record<string, any[]>>({})
  const [radOrders, setRadOrders] = useState<any[]>([])
  const [vitalsList, setVitalsList] = useState<any[]>([])
  const [admissions, setAdmissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('summary')
  const [modalRx, setModalRx] = useState<any | null>(null)
  const [modalEnc, setModalEnc] = useState<any | null>(null)
  const [modalEncData, setModalEncData] = useState<{ prescriptions: any[]; labOrders: any[]; labResultsMap: Record<string, any[]>; radiologyOrders: any[]; doctorName: string } | null>(null)
  const [staffCache, setStaffCache] = useState<Record<string, string>>({})

  async function fetchDoctorNameWithCache(staffId: string): Promise<string> {
    if (staffCache[staffId]) return staffCache[staffId]
    const name = await fetchDoctorName(staffId)
    setStaffCache((p) => ({ ...p, [staffId]: name }))
    return name
  }

  async function enrichWithDoctor<T extends { encounter_id: string }>(items: T[]): Promise<(T & { doctor_name?: string })[]> {
    const enriched: (T & { doctor_name?: string })[] = []
    for (const item of items) {
      let doctorName = ''
      try {
        const enc = await api.get(`/encounters/${item.encounter_id}`)
        if (enc.data?.staff_id) doctorName = await fetchDoctorNameWithCache(enc.data.staff_id)
      } catch {}
      enriched.push({ ...item, doctor_name: doctorName })
    }
    return enriched
  }

  async function openEncounterModal(enc: any) {
    const doctorName = enc.staff_id ? await fetchDoctorNameWithCache(enc.staff_id) : 'N/A'
    setModalEnc(enc)
    setModalEncData(null)
    try {
      const [rxRes, labRes, radRes] = await Promise.all([
        api.get(`/prescriptions?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/lab-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
        api.get(`/radiology-orders?encounter_id=${enc.id}`).catch(() => ({ data: [] })),
      ])
      const labOrders = labRes.data || []
      const resultsMap: Record<string, any[]> = {}
      for (const lo of labOrders) {
        try { const r = await api.get(`/lab-results/${lo.id}`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
      }
      setModalEncData({ prescriptions: rxRes.data || [], labOrders, labResultsMap: resultsMap, radiologyOrders: radRes.data || [], doctorName })
    } catch { setModalEncData({ prescriptions: [], labOrders: [], labResultsMap: {}, radiologyOrders: [], doctorName }) }
  }

  useEffect(() => {
    if (!patientId) return
    async function load() {
      setLoading(true)
      try {
        const patRes = await api.get(`/patients/${patientId}`).catch(() => ({ data: null }))
        let loadedEncs: any[] = []
        if (patRes.data) {
          const { encounters: encs, ...patData } = patRes.data
          loadedEncs = encs || []
          setPatient(patData as Patient)
          setEncounters(loadedEncs)
          for (const enc of loadedEncs) {
            if (enc.staff_id) fetchDoctorNameWithCache(enc.staff_id)
          }
        }

        const encIds = loadedEncs.map((e: any) => e.id)

        const allRx: any[] = []
        const allLabOrders: any[] = []
        const allRadOrders: any[] = []
        const resultsMap: Record<string, any[]> = {}
        const vits: any[] = []

        for (const encId of encIds) {
          const [rxRes, labRes, radRes] = await Promise.all([
            api.get(`/prescriptions?encounter_id=${encId}`).catch(() => ({ data: [] })),
            api.get(`/lab-orders?encounter_id=${encId}`).catch(() => ({ data: [] })),
            api.get(`/radiology-orders?encounter_id=${encId}`).catch(() => ({ data: [] })),
          ])
          allRx.push(...(rxRes.data || []))
          allLabOrders.push(...(labRes.data || []))
          allRadOrders.push(...(radRes.data || []))

          for (const lo of (labRes.data || [])) {
            try { const r = await api.get(`/lab-results/${lo.id}`); if (r.data?.length) resultsMap[lo.id] = r.data } catch {}
          }

          try {
            const v = await api.get(`/vitals/${encId}`)
            if (v.data?.id) {
              const enc = loadedEncs.find((e: any) => e.id === encId)
              let nurseName = ''
              if (enc?.staff_id) {
                try { const s = await api.get(`/staff/${enc.staff_id}`); nurseName = s.data?.name || '' } catch {}
              }
              vits.push({ ...v.data, nurse_name: nurseName, encounter_date: enc?.created_at })
            }
          } catch {}
        }

        setRxList(allRx)
        setLabOrders(allLabOrders)
        setRadOrders(allRadOrders)
        setLabResults(resultsMap)
        setVitalsList(vits)

        const admRes = await api.get(`/admissions?patient_id=${patientId}`).catch(() => ({ data: [] }))
        setAdmissions(admRes.data || [])
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [patientId])

  useEffect(() => {
    if (rxList.length > 0 && !(rxList[0] as any).doctor_name) {
      enrichWithDoctor(rxList).then(setRxList)
    }
  }, [rxList.length])

  useEffect(() => {
    if (labOrders.length > 0 && !(labOrders[0] as any).doctor_name) {
      enrichWithDoctor(labOrders).then(setLabOrders)
    }
  }, [labOrders.length])

  useEffect(() => {
    if (radOrders.length > 0 && !(radOrders[0] as any).doctor_name) {
      enrichWithDoctor(radOrders).then(setRadOrders)
    }
  }, [radOrders.length])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!patient) return <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400"><AlertTriangle size={32} /><p className="text-sm mt-2">Patient not found</p></div>

  const sections = [
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'vitals', label: `Vitals (${vitalsList.length})`, icon: Activity },
    { id: 'encounters', label: `Encounters (${encounters.length})`, icon: Clock },
    { id: 'prescriptions', label: `Rx (${rxList.length})`, icon: Pill },
    { id: 'lab', label: `Lab (${labOrders.length})`, icon: FlaskConical },
    { id: 'radiology', label: `Radiology (${radOrders.length})`, icon: Scan },
    { id: 'admissions', label: `Admissions (${admissions.length})`, icon: Home },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patient Chart</h1>
          <p className="text-sm text-slate-400">{patient.full_name} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; {patient.blood_type || 'N/A'}</p>
        </div>
        <button onClick={() => navigate(`/consultation/${patientId}`)}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <Stethoscope size={15} /> Consult
        </button>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => {
          const Icon = s.icon
          return (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeSection === s.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}>
              <Icon size={15} /> {s.label}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      {activeSection === 'summary' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Patient Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                { label: 'Full Name', value: patient.full_name },
                { label: 'Sex', value: patient.sex || '—' },
                { label: 'DOB', value: patient.dob?.slice(0, 10) || '—' },
                { label: 'Blood Type', value: patient.blood_type || '—' },
                { label: 'Phone', value: patient.phone || '—' },
                { label: 'Insurance', value: patient.insurance || '—' },
                { label: 'Next of Kin', value: patient.next_of_kin || '—' },
                { label: 'Status', value: patient.status?.replace('_', ' ') || '—' },
              ].map((f) => (
                <div key={f.label}>
                  <p className="text-xs text-slate-400">{f.label}</p>
                  <p className="font-medium text-slate-800 mt-0.5">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Pill size={16} className="text-violet-500" /><h3 className="text-sm font-semibold">Recent Prescriptions</h3></div>
              {rxList.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {rxList.slice(0, 5).map((rx: any) => (
                    <button key={rx.id} onClick={() => setModalRx(rx)}
                      className="w-full flex justify-between text-xs p-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                      <span className="text-slate-700 font-medium">{rx.drug_name}</span>
                      <span className="text-slate-400">{rx.quantity} × {rx.dosage}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><FlaskConical size={16} className="text-amber-500" /><h3 className="text-sm font-semibold">Lab Orders</h3></div>
              {labOrders.length === 0 ? <p className="text-xs text-slate-400">None</p> : (
                <div className="space-y-2">
                  {labOrders.slice(0, 5).map((l: any) => (
                    <div key={l.id} className="flex justify-between text-xs"><span className="text-slate-700">{l.test_name}</span><span className={`px-1.5 py-0.5 rounded text-[10px] ${l.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span></div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Activity size={16} className="text-primary" /><h3 className="text-sm font-semibold">Encounters</h3></div>
              <p className="text-2xl font-bold text-slate-900">{encounters.length}</p>
              <p className="text-xs text-slate-400">Total visits</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3"><Home size={16} className="text-indigo-500" /><h3 className="text-sm font-semibold">Admissions</h3></div>
              <p className="text-2xl font-bold text-slate-900">{admissions.length}</p>
              <p className="text-xs text-slate-400">Total admissions</p>
              {(() => {
                const active = admissions.find((a: any) => a.status === 'active')
                return active ? (
                  <div className="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-emerald-700 font-medium">Currently admitted</span>
                    <span className="text-emerald-400">·</span>
                    <span className="text-emerald-600">{active.ward_name}</span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-slate-500">Not admitted</div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Encounters */}
      {activeSection === 'encounters' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          {encounters.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No encounters recorded</p>
          ) : (
            <div className="space-y-3">
              {[...encounters].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((enc) => {
                const doctorName = enc.staff_id ? staffCache[enc.staff_id] : null
                return (
                  <button key={enc.id} onClick={() => openEncounterModal(enc)}
                    className="w-full text-left flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Clock size={15} className="text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold uppercase text-slate-700">{enc.encounter_type}</span>
                        <span className="text-xs text-slate-400">{new Date(enc.created_at).toLocaleString()}</span>
                        {doctorName && <span className="text-[11px] text-slate-500">by <strong>{doctorName}</strong></span>}
                      </div>
                      {enc.chief_complaint && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{enc.chief_complaint}</p>}
                      {enc.diagnoses && Array.isArray(enc.diagnoses) && enc.diagnoses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {enc.diagnoses.slice(0, 3).map((d: any, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">{d.code}</span>
                          ))}
                          {enc.diagnoses.length > 3 && <span className="text-[10px] text-slate-400">+{enc.diagnoses.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300 flex-shrink-0 mt-3" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Prescriptions */}
      {activeSection === 'prescriptions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {rxList.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No prescriptions</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Drug</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Dosage</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Qty</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Prescribed By</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">Date</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {rxList.map((rx: any) => (
                  <tr key={rx.id} onClick={() => setModalRx(rx)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-5 py-3 font-medium text-slate-800">{rx.drug_name}</td>
                    <td className="px-5 py-3 text-slate-500">{rx.dosage || '—'}</td>
                    <td className="px-5 py-3">{rx.quantity}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">{rx.doctor_name || '—'}</td>
                    <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${rx.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rx.status}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-400">{new Date(rx.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Lab */}
      {activeSection === 'lab' && (
        <div className="space-y-4">
          {labOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No lab orders</div>
          ) : labOrders.map((lab: any) => {
            const results = labResults[lab.id] || []
            return (
              <div key={lab.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">{lab.test_name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${lab.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lab.status}</span>
                </div>
                <div className="flex items-center gap-3 mb-3 text-[11px] text-slate-500">
                  {lab.doctor_name && <span>Ordered by: <strong>{lab.doctor_name}</strong></span>}
                  <span>{new Date(lab.created_at).toLocaleString()}</span>
                </div>
                {results.length > 0 ? (
                  <div className="space-y-1.5">
                    {results.map((r: any) => (
                      <div key={r.id} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-xl ${r.is_abnormal ? 'bg-rose-50' : 'bg-slate-50'}`}>
                        <span className="font-medium flex-1 text-slate-700">{r.analyte_name}</span>
                        <span className={`font-bold ${r.is_abnormal ? 'text-rose-600' : 'text-slate-800'}`}>{r.value}</span>
                        <span className="text-slate-400">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                        {r.is_abnormal && <AlertTriangle size={12} className="text-rose-500" />}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-400">Pending results</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Radiology */}
      {activeSection === 'radiology' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          {radOrders.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No radiology orders</p>
          ) : (
            <div className="space-y-3">
              {radOrders.map((rad: any) => (
                <div key={rad.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-800">{rad.imaging_type}</p>
                    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    {rad.doctor_name && <span>Ordered by: <strong>{rad.doctor_name}</strong></span>}
                    <span>{new Date(rad.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admissions */}
      {activeSection === 'admissions' && (
        <div className="space-y-4">
          {admissions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No admissions recorded</div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{admissions.length}</p>
                    <p className="text-sm text-slate-500">Total admissions</p>
                  </div>
                  {(() => {
                    const active = admissions.find((a: any) => a.status === 'active')
                    if (!active) return <div className="text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-2">Not currently admitted</div>
                    return (
                      <div className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-emerald-700 font-medium">Active — {active.ward_name}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
              {admissions.map((a: any, idx: number) => (
                <div key={a.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-5 py-3 border-b flex items-center justify-between ${a.status === 'active' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-2">
                      <Home size={15} className={a.status === 'active' ? 'text-emerald-600' : 'text-slate-500'} />
                      <span className="text-sm font-semibold text-slate-700">{a.ward_name}</span>
                      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold ${
                        a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}>{a.status === 'active' ? 'Active' : 'Discharged'}</span>
                    </div>
                    <span className="text-xs text-slate-500">{new Date(a.admitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><span className="text-slate-500">Admitted:</span> <span className="font-medium text-slate-700">{new Date(a.admitted_at).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Admitted by:</span> <span className="font-medium text-slate-700">{a.admitted_by_name || '—'}</span></div>
                      {a.discharged_at && <div><span className="text-slate-500">Discharged:</span> <span className="font-medium text-slate-700">{new Date(a.discharged_at).toLocaleString()}</span></div>}
                      {a.discharged_by_name && <div><span className="text-slate-500">Discharged by:</span> <span className="font-medium text-slate-700">{a.discharged_by_name}</span></div>}
                    </div>
                    {a.notes && <p className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{a.notes}</p>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Prescription Detail Modal */}
      {modalRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setModalRx(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Pill size={18} className="text-violet-500" />
                Prescription Details
              </h2>
              <button onClick={() => setModalRx(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Drug Name</p>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{modalRx.drug_name}</p>
                </div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Dosage</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.dosage || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Quantity</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.quantity}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Status</p><span className={`inline-flex mt-0.5 px-2.5 py-0.5 rounded-lg text-xs font-medium ${modalRx.status === 'dispensed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{modalRx.status}</span></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Prescribed By</p><p className="text-sm font-medium text-slate-700 mt-0.5">{modalRx.doctor_name || '—'}</p></div>
                <div><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Date</p><p className="text-sm font-medium text-slate-700 mt-0.5">{new Date(modalRx.created_at).toLocaleString()}</p></div>
                <div className="col-span-2"><p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Instructions</p><p className="text-sm text-slate-600 mt-0.5 bg-slate-50 rounded-xl p-3">{modalRx.instructions || 'No instructions provided'}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Encounter Detail Modal */}
      {modalEnc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setModalEnc(null); setModalEncData(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                Encounter Details
              </h2>
              <button onClick={() => { setModalEnc(null); setModalEncData(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700 capitalize">{modalEnc.encounter_type}</span></div>
                <div><span className="text-slate-500">Doctor:</span> <span className="font-medium text-slate-700">{modalEncData?.doctorName || '—'}</span></div>
                <div><span className="text-slate-500">Created:</span> <span className="font-medium text-slate-700">{new Date(modalEnc.created_at).toLocaleString()}</span></div>
                {modalEnc.updated_at !== modalEnc.created_at && (
                  <div><span className="text-slate-500">Updated:</span> <span className="font-medium text-slate-700">{new Date(modalEnc.updated_at).toLocaleString()}</span></div>
                )}
              </div>
              {modalEnc.chief_complaint && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Chief Complaint</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{modalEnc.chief_complaint}</p>
                </div>
              )}
              {modalEnc.diagnoses && Array.isArray(modalEnc.diagnoses) && modalEnc.diagnoses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Diagnoses</p>
                  <div className="space-y-1.5">
                    {modalEnc.diagnoses.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-blue-600 font-medium">{d.code}</span>
                        <span className="text-slate-700">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const soap = modalEnc.soap_notes ? (typeof modalEnc.soap_notes === 'string' ? JSON.parse(modalEnc.soap_notes) : modalEnc.soap_notes) : null
                if (!soap) return null
                const fields = ['subjective', 'objective', 'assessment', 'plan'] as const
                return (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SOAP Notes</p>
                    <div className="grid grid-cols-2 gap-3">
                      {fields.map((f) => soap[f] ? (
                        <div key={f} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary capitalize mb-0.5">{f}</p>
                          <p className="text-sm text-slate-700">{soap[f]}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )
              })()}
              {modalEncData && (
                <>
                  {modalEncData.prescriptions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Pill size={12} /> Prescriptions ({modalEncData.prescriptions.length})</p>
                      <div className="space-y-1.5">
                        {modalEncData.prescriptions.map((rx: any) => (
                          <div key={rx.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm">
                            <div><span className="font-medium text-slate-800">{rx.drug_name}</span> <span className="text-slate-400">{rx.dosage}</span></div>
                            <span className="text-slate-500">Qty: {rx.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {modalEncData.labOrders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><FlaskConical size={12} /> Lab Orders ({modalEncData.labOrders.length})</p>
                      <div className="space-y-2">
                        {modalEncData.labOrders.map((lab: any) => {
                          const results = modalEncData.labResultsMap[lab.id] || []
                          return (
                            <div key={lab.id} className="bg-slate-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-slate-800">{lab.test_name}</span>
                                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${lab.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{lab.status}</span>
                              </div>
                              {results.length > 0 && results.map((r: any) => (
                                <div key={r.id} className={`flex items-center gap-3 text-xs px-2.5 py-1 rounded-lg mt-1 ${r.is_abnormal ? 'bg-rose-50 text-rose-700' : 'bg-white text-slate-600'}`}>
                                  <span className="font-medium flex-1">{r.analyte_name}</span>
                                  <span className="font-bold">{r.value}</span>
                                  <span className="text-slate-400">({r.reference_range_low || '?'}–{r.reference_range_high || '?'})</span>
                                  {r.is_abnormal && <AlertTriangle size={10} className="text-rose-500" />}
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {modalEncData.radiologyOrders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Scan size={12} /> Radiology Orders ({modalEncData.radiologyOrders.length})</p>
                      <div className="space-y-1.5">
                        {modalEncData.radiologyOrders.map((rad: any) => (
                          <div key={rad.id} className="flex items-center justify-between bg-slate-50 rounded-xl p-3 text-sm">
                            <span className="font-medium text-slate-800">{rad.imaging_type}</span>
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${rad.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{rad.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!modalEncData && <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-primary" /></div>}
            </div>
          </div>
        </div>
      )}

      {/* Vitals */}
      {activeSection === 'vitals' && (
        <div className="space-y-3">
          {vitalsList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">No vitals recorded</div>
          ) : vitalsList.map((v: any, idx: number) => (
            <div key={v.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <Activity size={15} className="text-primary" />
                  <span className="text-xs font-semibold text-slate-700 uppercase">
                    Vitals — {new Date(v.encounter_date || v.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {v.triage_priority && (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                      v.triage_priority === 'red' ? 'bg-red-100 text-red-700' :
                      v.triage_priority === 'yellow' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>{v.triage_priority.toUpperCase()}</span>
                  )}
                </div>
                {v.nurse_name && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <User size={12} />
                    <span>by <strong className="text-slate-700">{v.nurse_name}</strong></span>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3 text-center">
                  {[
                    { label: 'BP', value: v.systolic_bp && v.diastolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : '—' },
                    { label: 'Pulse', value: v.pulse ? `${v.pulse}` : '—' },
                    { label: 'Temp', value: v.temperature ? `${v.temperature}°C` : '—' },
                    { label: 'RR', value: v.respiration_rate ? `${v.respiration_rate}` : '—' },
                    { label: 'SpO₂', value: v.spo2 ? `${v.spo2}%` : '—' },
                    { label: 'Weight', value: v.weight ? `${v.weight}kg` : '—' },
                    { label: 'Triage', value: v.triage_priority ? v.triage_priority.toUpperCase() : '—' },
                  ].map((f) => (
                    <div key={f.label} className="bg-slate-50 rounded-xl p-2.5">
                      <p className="text-[10px] text-slate-400 font-medium uppercase">{f.label}</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{f.value}</p>
                    </div>
                  ))}
                </div>
                {v.nursing_notes && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium uppercase mb-1">Nursing Notes</p>
                    <p className="text-sm text-slate-600">{v.nursing_notes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
