import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  Scan, Loader2, ClipboardList, FileText, Clock, TrendingUp, ArrowRight, CheckCircle, XCircle,
} from 'lucide-react'

export default function RadiologyDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ ordered: 0, processing: 0, review: 0, completed: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [statsRes] = await Promise.all([
          api.get('/radiology-orders/stats').catch(() => ({ data: { ordered: 0, processing: 0, completed: 0, total: 0 } })),
        ])
        setStats(statsRes.data)
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Scan size={22} className="text-indigo-600" /></div>
        <h1 className="text-xl font-bold text-slate-800">Radiology Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Ordered', value: stats.ordered, color: 'text-blue-600', bg: 'bg-blue-100' },
          { label: 'Processing', value: stats.processing, color: 'text-purple-600', bg: 'bg-purple-100' },
          { label: 'In Review', value: stats.review, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Total', value: stats.total, color: 'text-slate-600', bg: 'bg-slate-100' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={() => navigate('/radiology/worklist')}
          className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-left">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center"><ClipboardList size={24} className="text-blue-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Worklist</p>
            <p className="text-xs text-slate-500 mt-0.5">Enter and edit reports</p>
          </div>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
        <button onClick={() => navigate('/radiology/review')}
          className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-left">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center"><CheckCircle size={24} className="text-amber-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Review</p>
            <p className="text-xs text-slate-500 mt-0.5">Approve or reject reports</p>
          </div>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
        <button onClick={() => navigate('/radiology/results')}
          className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-left">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center"><FileText size={24} className="text-emerald-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">Results</p>
            <p className="text-xs text-slate-500 mt-0.5">View completed reports</p>
          </div>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
        <button onClick={() => navigate('/radiology/history')}
          className="flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-left">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center"><Clock size={24} className="text-purple-600" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800">History</p>
            <p className="text-xs text-slate-500 mt-0.5">Browse historical reports</p>
          </div>
          <ArrowRight size={16} className="text-slate-400" />
        </button>
      </div>
    </div>
  )
}
