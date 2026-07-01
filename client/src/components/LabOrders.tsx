import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import {
  FlaskConical, Loader2, Clock, ArrowRight,
} from 'lucide-react'

const SPECIMEN_TYPES = ['Blood', 'Urine', 'Stool', 'Sputum', 'CSF', 'Swab', 'Tissue', 'Serum', 'Plasma', 'Other']
const PRIORITIES = ['Routine', 'Urgent', 'STAT']

export default function LabOrders() {
  const navigate = useNavigate()
  const [labOrders, setLabOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const labRes = await api.get('/lab-orders').catch(() => ({ data: [] }))
      setLabOrders(labRes.data || [])
    } catch {} finally { setLoading(false) }
  }

  const unpaidOrders = labOrders.filter((o: any) => o.is_paid === false)
  const unpaidCount = unpaidOrders.length

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lab Orders</h1>
            <p className="text-sm text-slate-500">{unpaidCount} unpaid lab order{unpaidCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => navigate('/lab/worklist')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <FlaskConical size={14} /> Worklist
        </button>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Clock size={16} className="text-rose-500" /> Unpaid Lab Orders</h2>
        {unpaidOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400">
            <FlaskConical size={40} className="mx-auto mb-3 text-emerald-300" />
            <p className="text-sm font-medium">All lab orders have been paid for.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unpaidOrders.map((o: any) => (
              <div key={o.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{o.test_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{o.patient_name || 'Walk-in Patient'}</p>
                    {o.lab_number && <p className="text-xs text-slate-400 font-mono mt-0.5">#{o.lab_number}</p>}
                    {o.doctor_comment && <DoctorComment comment={o.doctor_comment} />}
                  </div>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-rose-100 text-rose-700 flex-shrink-0">Awaiting Payment</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
