import { useState, useEffect, Fragment } from 'react'
import { ScrollText, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../hooks/superadminApi'

interface AuditRow {
  id: string
  action: string
  table_name: string
  record_id: string | null
  performed_by: string | null
  old_data: any
  new_data: any
  created_at: string
  hospital_name: string | null
}

interface AuditResponse {
  rows: AuditRow[]
  total: number
}

const PAGE_SIZE = 50

export default function SuperAdminAudit() {
  const [data, setData] = useState<AuditResponse>({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [tableName, setTableName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function fetchLogs() {
    setLoading(true)
    try {
      const params: any = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
      if (action.trim()) params.action = action.trim()
      if (tableName.trim()) params.table_name = tableName.trim()
      if (from) params.from = new Date(from).toISOString()
      if (to) params.to = new Date(new Date(to).getTime() + 86400000).toISOString()
      const res = await api.get('/superadmin/audit-logs', { params })
      setData(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [page])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  function renderJson(v: any) {
    if (v === null || v === undefined) return <span className="text-slate-300">null</span>
    return <pre className="text-[11px] font-mono text-slate-600 whitespace-pre-wrap break-all">{JSON.stringify(v, null, 1)}</pre>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Audit Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Immutable record of all clinical and administrative changes</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action (e.g. INSERT)"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <input type="text" value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="Table name (e.g. patients)"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={() => { setPage(0); fetchLogs() }}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all">
            Apply Filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <ScrollText className="w-12 h-12 mb-3" />
          <p className="text-sm font-medium">No audit records found</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium">Hospital</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Table</th>
                  <th className="px-5 py-3 font-medium">Performed By</th>
                  <th className="px-5 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3 text-slate-500">{r.hospital_name || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          r.action === 'DELETE' ? 'bg-rose-100 text-rose-700'
                          : r.action === 'UPDATE' ? 'bg-amber-100 text-amber-700'
                          : r.action === 'INSERT' || r.action === 'CREATE' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                        }`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">{r.table_name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{r.performed_by ? r.performed_by.slice(0, 8) : '—'}</td>
                      <td className="px-5 py-3 text-slate-400 text-xs">Click to expand</td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-slate-50/70 border-b border-slate-100">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-1">Old Data</p>
                              <div className="bg-white rounded-xl border border-slate-200 p-3 max-h-64 overflow-auto">
                                {renderJson(r.old_data)}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-1">New Data</p>
                              <div className="bg-white rounded-xl border border-slate-200 p-3 max-h-64 overflow-auto">
                                {renderJson(r.new_data)}
                              </div>
                            </div>
                          </div>
                          {r.record_id && <p className="text-xs text-slate-400 mt-2 font-mono">Record: {r.record_id}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <p>Showing {data.rows.length} of {data.total} records</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <span className="px-3 py-1.5">Page {page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
