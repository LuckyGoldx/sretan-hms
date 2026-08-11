import { useState, useEffect } from 'react'
import { Loader2, Plus, Search, Shield, ExternalLink } from 'lucide-react'

export default function InsuranceCases() {
  const [cases, setCases] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [casesRes, provRes] = await Promise.all([
        api.get('/insurance/cases'),
        api.get('/insurance/providers'),
      ])
      setCases(Array.isArray(casesRes.data) ? casesRes.data : [])
      setProviders(Array.isArray(provRes.data) ? provRes.data : [])
    } catch {} finally { setLoading(false) }
  }

  const filtered = cases.filter(c => {
    if (filterProvider && c.provider_id !== filterProvider) return false
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(c.patient_name?.toLowerCase().includes(q) || c.hospital_number?.toLowerCase().includes(q) || c.case_number?.toLowerCase().includes(q))) return false
    }
    return true
  })

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { active: 'bg-emerald-100 text-emerald-700', closed: 'bg-slate-100 text-slate-600', disputed: 'bg-rose-100 text-rose-700', voided: 'bg-slate-100 text-slate-400' }
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-500'}`}>{status}</span>
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Insurance Cases</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} case{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <a href="/insurance/cases/new" className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
          <Plus className="w-4 h-4" /> New Case
        </a>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, case #, or hospital #..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500" />
        </div>
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Providers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="disputed">Disputed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {/* Cases Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Case #</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Patient</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Auth Code</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Billed</th>
              <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
              <th className="text-center py-3 px-4 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3 px-4 font-mono text-xs font-bold">{c.case_number}</td>
                <td className="py-3 px-4">
                  <p className="font-medium">{c.patient_name || 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{c.hospital_number || ''}</p>
                </td>
                <td className="py-3 px-4">{c.provider_name || '—'}</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-500">{c.auth_code || '—'}</td>
                <td className="py-3 px-4 text-right font-medium">₦{Number(c.total_billed || 0).toLocaleString()}</td>
                <td className="py-3 px-4 text-center">{statusBadge(c.status)}</td>
                <td className="py-3 px-4 text-center">
                  <a href={`/insurance/cases/${c.id}`} className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-xs font-medium">
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-slate-400">No cases found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
