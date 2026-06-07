import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  ClipboardList, Loader2, Search, ArrowLeft, Pill, Clock, Filter
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface DispensedRx {
  id: string
  encounter_id: string
  drug_name: string
  dosage: string
  quantity: number
  instructions: string
  status: string
  created_at: string
  patient_name?: string
}

export default function DispensingHistory() {
  const navigate = useNavigate()
  const [rxList, setRxList] = useState<DispensedRx[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      try {
        const { data } = await api.get<DispensedRx[]>('/prescriptions?status=dispensed')
        const withPatients = await Promise.all(
          (data || []).map(async (rx) => {
            try {
              const encResp = await api.get<any>(`/encounters/${rx.encounter_id}`)
              const patResp = await api.get<any>(`/patients/${encResp.data.patient_id}`)
              return { ...rx, patient_name: patResp.data.full_name }
            } catch { return { ...rx, patient_name: 'Unknown' } }
          })
        )
        setRxList(withPatients || [])
      } catch { setRxList([]) } finally { setLoading(false) }
    }
    fetch()
  }, [])

  const filtered = rxList.filter((rx) =>
    rx.drug_name.toLowerCase().includes(search.toLowerCase()) ||
    (rx.patient_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalDispensed = rxList.reduce((sum, rx) => sum + rx.quantity, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/pharmacy')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center"><ClipboardList size={22} className="text-sky-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dispensing History</h1>
          <p className="text-sm text-slate-500">Completed dispensations audit trail</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
          <Pill size={13} /> {totalDispensed} units dispensed
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search by drug or patient..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <ClipboardList size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">{rxList.length === 0 ? 'No dispensations recorded yet' : 'No results matching your search'}</p>
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
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Instructions</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Dispensed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((rx) => (
                  <tr key={rx.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-800">{rx.drug_name}</td>
                    <td className="px-5 py-3.5 text-slate-600">{rx.dosage || '—'}</td>
                    <td className="px-5 py-3.5">{rx.quantity}</td>
                    <td className="px-5 py-3.5 text-slate-600">{rx.patient_name || 'Unknown'}</td>
                    <td className="px-5 py-3.5 text-slate-400 max-w-[120px] lg:max-w-[200px] truncate">{rx.instructions || '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(rx.created_at).toLocaleString()}
                    </td>
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
