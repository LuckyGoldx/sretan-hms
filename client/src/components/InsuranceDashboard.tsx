import { useState, useEffect } from 'react'
import { Shield, Building2, FileText, CreditCard, Activity, Search, Loader2, PlusCircle, ArrowLeft } from 'lucide-react'

export default function InsuranceDashboard() {
  const [user, setUser] = useState<any>(null)
  const [providers, setProviders] = useState<any[]>([])
  const [stats, setStats] = useState({ activeCases: 0, totalCases: 0, providers: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('sretan_user')
    if (stored) { try { setUser(JSON.parse(stored)) } catch {} }
    loadData()
  }, [])

  const [monthBilled, setMonthBilled] = useState(0)
  const [openInvoices, setOpenInvoices] = useState(0)

  async function loadData() {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [provRes, invRes] = await Promise.all([
        api.get('/insurance/providers'),
        api.get('/insurance/invoices'),
      ])
      const provData = Array.isArray(provRes.data) ? provRes.data : []
      const invData = Array.isArray(invRes.data) ? invRes.data : []
      setProviders(provData)
      setStats({ providers: provData.length, activeCases: provData.filter((p: any) => p.is_active).length, totalCases: provData.length })

      // Open invoices (draft + sent)
      const open = invData.filter((i: any) => ['draft', 'sent'].includes(i.status)).length
      setOpenInvoices(open)

      // This month billed (WAT timezone: UTC+1)
      const now = new Date()
      const watOffset = 1
      const local = new Date(now.getTime() + watOffset * 60 * 60 * 1000)
      const month = local.getUTCMonth()
      const year = local.getUTCFullYear()
      const monthStart = new Date(Date.UTC(year, month, 1))
      const monthEnd = new Date(Date.UTC(year, month + 1, 1))

      const thisMonth = invData.filter((i: any) => {
        if (!['sent', 'paid'].includes(i.status)) return false
        const created = new Date(i.created_at)
        return created >= monthStart && created < monthEnd
      })
      const total = thisMonth.reduce((sum: number, i: any) => sum + parseFloat(i.total_amount || 0), 0)
      setMonthBilled(total)
    } catch (e) { console.error('Failed to load insurance data', e) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>

  const providerName = user?.provider_id
    ? providers.find((p: any) => p.id === user.provider_id)?.name || 'Your HMO'
    : 'All HMOs'

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Insurance Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">{user?.access_scope === 'all' ? 'Cross-Provider View' : providerName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50"><Activity className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{stats.activeCases}</p><p className="text-xs text-slate-500">{stats.activeCases === 1 ? 'Active Provider' : 'Active Providers'}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50"><Building2 className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{stats.providers}</p><p className="text-xs text-slate-500">{stats.providers === 1 ? 'Insurance Provider' : 'Insurance Providers'}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50"><FileText className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-2xl font-bold text-slate-800">{openInvoices}</p><p className="text-xs text-slate-500">{openInvoices === 1 ? 'Open Invoice' : 'Open Invoices'}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-50"><CreditCard className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-2xl font-bold text-slate-800">₦{monthBilled.toLocaleString()}</p><p className="text-xs text-slate-500">This Month Billed</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <a href="/insurance/cases" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all">
            <Search className="w-6 h-6 text-blue-600" /><span className="text-xs font-medium text-slate-700">All Cases</span>
          </a>
          <a href="/insurance/cases/new" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-all">
            <PlusCircle className="w-6 h-6 text-emerald-600" /><span className="text-xs font-medium text-slate-700">New Case</span>
          </a>
          <a href="/insurance/invoices" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-all">
            <FileText className="w-6 h-6 text-amber-600" /><span className="text-xs font-medium text-slate-700">Invoices</span>
          </a>
          <a href="/insurance/patients" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition-all">
            <Search className="w-6 h-6 text-purple-600" /><span className="text-xs font-medium text-slate-700">Patients</span>
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Insurance Providers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200">
              <th className="text-left py-3 px-4 font-medium text-slate-600">Code</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Name</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Contact</th>
              <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
            </tr></thead>
            <tbody>
              {providers.map((p: any) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-xs">{p.code}</td>
                  <td className="py-3 px-4 font-medium">{p.name}</td>
                  <td className="py-3 px-4 text-slate-500">{p.contact_email || p.contact_phone || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                </tr>
              ))}
              {providers.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No providers found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
