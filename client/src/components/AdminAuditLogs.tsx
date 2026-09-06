import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  ArrowLeft, ScrollText, Loader2, Search, RefreshCw, X, FileText, Filter, Calendar,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const TABLE_OPTIONS = [
  'admissions', 'wards', 'inventory_items', 'payments', 'payment_items', 'admission_daily_charges',
  'patients', 'visits', 'prescriptions', 'lab_orders', 'radiology_orders', 'referrals',
  'insurance_cases', 'encounters', 'staff_users', 'otc_sales',
]
const ACTION_OPTIONS = ['INSERT', 'UPDATE', 'DELETE']

const ACTION_STYLES: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-rose-100 text-rose-700',
}

function formatWhen(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function summarizeRecord(record: any): string {
  const n = record?.new_data || record?.old_data
  if (!n) return ''
  const t = record?.table_name || ''
  if (t === 'admissions') {
    const w = typeof n === 'object' ? n.ward_id || n.status || n.patient_id : ''
    return String(w || 'admission record')
  }
  if (t === 'wards') return String((typeof n === 'object' && (n.name || n.code)) || 'ward')
  if (t === 'inventory_items') return String((typeof n === 'object' && n.drug_name) || 'item')
  if (t === 'payments') return String((typeof n === 'object' && (n.receipt_number || n.id)) || 'payment')
  return String(record?.record_id || '')
}

export default function AdminAuditLogs() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableFilter, setTableFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detail, setDetail] = useState<any | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tableFilter) params.set('table_name', tableFilter)
      if (actionFilter) params.set('action', actionFilter)
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const q = params.toString()
      const res = await api.get(`/audit-logs${q ? `?${q}` : ''}`)
      setLogs(res.data || [])
    } catch { setLogs([]) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/setup')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ScrollText size={22} className="text-emerald-600" /> Audit Logs</h1>
            <p className="text-sm text-slate-500">Immutable trail of clinical, billing and configuration changes in this hospital.</p>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider"><Filter size={13} /> Filters</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="">All tables</option>
            {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Search within record data (name, receipt, ward...)" className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Apply</button>
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 size={26} className="animate-spin text-emerald-500" /></div>}

      {!loading && logs.length === 0 && (
        <div className="text-center py-14 text-slate-400">
          <ScrollText size={36} className="mx-auto mb-2 text-slate-200" />
          <p className="text-sm">No audit records match the current filters.</p>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-5 py-3">Date &amp; Time</th>
                  <th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Table</th>
                  <th className="px-5 py-3">Record</th>
                  <th className="px-5 py-3 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-xs text-slate-500">{formatWhen(l.created_at)}</td>
                    <td className="px-5 py-3 text-slate-700">{l.performed_by_name || (l.performed_by ? <span className="font-mono text-xs">{String(l.performed_by).slice(0, 8)}</span> : <span className="text-slate-300">—</span>)}</td>
                    <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_STYLES[l.action] || 'bg-slate-100 text-slate-600'}`}>{l.action || '—'}</span></td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.table_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 max-w-[220px] truncate">{l.patient_name || summarizeRecord(l)}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setDetail(l)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <FileText size={12} /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <ScrollText size={18} className="text-emerald-600" />
                Audit Detail — <span className="font-mono">{detail.table_name}</span>
              </h2>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-slate-400 font-medium mb-0.5">Date</p><p className="text-slate-700 font-medium">{formatWhen(detail.created_at)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-slate-400 font-medium mb-0.5">Action</p><p className="text-slate-700 font-medium">{detail.action}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-slate-400 font-medium mb-0.5">Record ID</p><p className="text-slate-700 font-medium break-all font-mono text-[10px]">{detail.record_id || '—'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-slate-400 font-medium mb-0.5">Performed by</p><p className="text-slate-700 font-medium">{detail.performed_by_name || (detail.performed_by ? <span className="font-mono">{String(detail.performed_by).slice(0, 8)}</span> : 'System')}</p>
                </div>
              </div>
              {detail.old_data && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Before (old_data)</p>
                  <pre className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(detail.old_data, null, 2)}</pre>
                </div>
              )}
              {detail.new_data && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">After (new_data)</p>
                  <pre className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(detail.new_data, null, 2)}</pre>
                </div>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button onClick={() => setDetail(null)} className="px-5 py-2 rounded-xl bg-slate-700 text-white text-sm font-medium hover:bg-slate-800">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
