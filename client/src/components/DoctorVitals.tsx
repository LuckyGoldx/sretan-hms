import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Activity, Search, Loader2, User, Clock, ChevronRight, AlertTriangle, ArrowLeft
} from 'lucide-react'

export default function DoctorVitals() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<any[]>([])
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null)
  const [vitals, setVitals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vitalsLoading, setVitalsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [staffCache, setStaffCache] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get('/patients')
        setPatients(data || [])
      } catch { setPatients([]) } finally { setLoading(false) }
    }
    load()
  }, [])

  async function loadVitals(patient: any) {
    setSelectedPatient(patient)
    setVitalsLoading(true)
    try {
      const encRes = await api.get(`/encounters?patient_id=${patient.id}`)
      const encs = encRes.data || []
      const vits: any[] = []
      for (const enc of encs) {
        try {
          const v = await api.get(`/vitals/${enc.id}`)
          if (v.data && v.data.id) {
            let nurseName = ''
            if (enc.staff_id) {
              if (staffCache[enc.staff_id]) {
                nurseName = staffCache[enc.staff_id]
              } else {
                try {
                  const s = await api.get(`/staff/${enc.staff_id}`)
                  nurseName = s.data?.name || ''
                  setStaffCache((p) => ({ ...p, [enc.staff_id]: nurseName }))
                } catch {}
              }
            }
            vits.push({ ...v.data, nurse_name: nurseName, recorded_at: enc.created_at })
          }
        } catch {}
      }
      setVitals(vits.sort((a, b) => new Date(b.recorded_at || b.created_at).getTime() - new Date(a.recorded_at || a.created_at).getTime()))
    } catch { setVitals([]) } finally { setVitalsLoading(false) }
  }

  const filtered = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (p.hospital_number || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        {selectedPatient && (
          <button onClick={() => { setSelectedPatient(null); setVitals([]) }} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        )}
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Activity className="w-5 h-5 text-primary" /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patient Vitals</h1>
          <p className="text-sm text-slate-400">{selectedPatient ? `${selectedPatient.full_name} — Vitals History` : 'Select a patient to view vitals history'}</p>
        </div>
      </div>

      {!selectedPatient ? (
        <>
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search patients by name or hospital #..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <User size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No patients found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => loadVitals(p)}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-left hover:shadow-md hover:border-slate-300 transition-all group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><User size={16} className="text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400">{p.hospital_number || p.id?.slice(0, 8)}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                  <p className="text-xs text-slate-500">{p.sex} &middot; {p.dob?.slice(0, 10) || '—'} &middot; {p.blood_type || '—'}</p>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {vitalsLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
          ) : vitals.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-slate-400">
              <Activity size={40} className="text-slate-300 mb-3" />
              <p className="text-sm font-medium">No vitals recorded for this patient</p>
            </div>
          ) : (
            <div className="space-y-4">
              {vitals.map((v, idx) => (
                <div key={v.id || idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Activity size={15} className="text-primary" />
                      <span className="text-xs font-semibold text-slate-600">
                        {new Date(v.recorded_at || v.created_at).toLocaleDateString('en-GB', {
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
                      <span className="text-xs text-slate-500">by <strong>{v.nurse_name}</strong></span>
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
                      <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
                        <span className="text-xs text-slate-400 font-medium">Nursing Notes:</span> {v.nursing_notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
