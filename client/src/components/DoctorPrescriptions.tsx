import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Pill, Search, Clock, Loader2, AlertTriangle, CheckCircle, XCircle, ArrowLeft, Eye
} from 'lucide-react'

interface RxItem {
  id: string
  drug_name: string
  dosage: string
  quantity: number
  instructions: string
  status: string
  created_at: string
  encounter_id: string
  patient_name?: string
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  dispensed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

export default function DoctorPrescriptions() {
  const navigate = useNavigate()
  const [rxList, setRxList] = useState<RxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const doctorId: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return null })()

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const { data } = await api.get<RxItem[]>(`/prescriptions${doctorId ? `?doctor_id=${doctorId}` : ''}`)
        const withPatients = await Promise.all(
          (data || []).map(async (rx) => {
            try {
              const enc = await api.get<any>(`/encounters/${rx.encounter_id}`)
              const pat = await api.get<any>(`/patients/${enc.data.patient_id}`)
              return { ...rx, patient_name: pat.data.full_name }
            } catch { return { ...rx, patient_name: 'Unknown' } }
          })
        )
        setRxList(withPatients || [])
      } catch { setRxList([]) } finally { setLoading(false) }
    }
    fetch()
  }, [])

  const filtered = rxList.filter((rx) => {
    const matchSearch = rx.drug_name.toLowerCase().includes(search.toLowerCase()) ||
      (rx.patient_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || rx.status === statusFilter
    return matchSearch && matchStatus
  })

  const stats = {
    total: rxList.length,
    pending: rxList.filter((r) => r.status === 'pending').length,
    dispensed: rxList.filter((r) => r.status === 'dispensed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><Pill size={22} className="text-violet-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Prescriptions</h1>
          <p className="text-sm text-slate-500">All prescribed medications and their status</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', count: stats.total, color: 'text-violet-600', bg: 'bg-violet-100' },
          { label: 'Pending', count: stats.pending, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Dispensed', count: stats.dispensed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search by drug or patient..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-44 rounded-xl border border-slate-200 px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="dispensed">Dispensed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Pill size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">{rxList.length === 0 ? 'No prescriptions written yet' : 'No results matching your search'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Drug</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Dosage</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Qty</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Patient</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((rx) => (
                  <tr key={rx.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{rx.drug_name}</td>
                    <td className="px-5 py-3.5 text-slate-600">{rx.dosage || '—'}</td>
                    <td className="px-5 py-3.5">{rx.quantity}</td>
                    <td className="px-5 py-3.5 text-slate-600">{rx.patient_name || 'Unknown'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${STATUS_STYLES[rx.status] || 'bg-slate-100 text-slate-600'}`}>
                        {rx.status === 'dispensed' ? <CheckCircle size={11} /> : rx.status === 'pending' ? <Clock size={11} /> : <XCircle size={11} />}
                        {rx.status.charAt(0).toUpperCase() + rx.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(rx.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
