import { useState, useEffect } from 'react'
import { Loader2, Calendar, TrendingUp, DollarSign, Clock, BarChart3 } from 'lucide-react'

export default function InsuranceReports() {
  const [providers, setProviders] = useState<any[]>([])
  const [providerId, setProviderId] = useState('')
  const [periodStart, setPeriodStart] = useState(() => { const d = new Date(); d.setMonth(0); return d.toISOString().slice(0, 10) })
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)

  const [utilization, setUtilization] = useState<any[]>([])
  const [financial, setFinancial] = useState<any[]>([])
  const [aging, setAging] = useState<any>(null)

  const [activeTab, setActiveTab] = useState('financial')

  useEffect(() => {
    (async () => {
      try {
        const { default: api } = await import('../hooks/useAxios')
        const r = await api.get('/insurance/providers')
        setProviders(Array.isArray(r.data) ? r.data : [])
      } catch {}
    })()
  }, [])

  async function loadReports() {
    setLoading(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const [utilRes, finRes, agingRes] = await Promise.all([
        providerId ? api.get(`/insurance/reports/utilization?provider_id=${providerId}&period_start=${periodStart}&period_end=${periodEnd}`) : Promise.resolve({ data: [] }),
        api.get(`/insurance/reports/financial?period_start=${periodStart}&period_end=${periodEnd}${providerId ? `&provider_id=${providerId}` : ''}`),
        api.get(`/insurance/reports/aging${providerId ? `?provider_id=${providerId}` : ''}`),
      ])
      setUtilization(Array.isArray(utilRes.data) ? utilRes.data : [])
      setFinancial(Array.isArray(finRes.data) ? finRes.data : [])
      setAging(agingRes.data)
    } catch {} finally { setLoading(false) }
  }

  const tabs = [
    { key: 'financial', label: 'Financial', icon: DollarSign },
    { key: 'utilization', label: 'Utilization', icon: BarChart3 },
    { key: 'aging', label: 'Aging', icon: Clock },
  ]

  const financialTotal = financial.reduce((s: number, r: any) => s + parseFloat(r.total_billed || 0), 0)
  const financialPaid = financial.reduce((s: number, r: any) => s + parseFloat(r.total_paid || 0), 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Insurance Reports</h1>
        <p className="text-sm text-slate-500 mt-1">View financial performance and utilization analytics</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
        <Calendar className="w-4 h-4 text-slate-400" />
        <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
        <select value={providerId} onChange={e => setProviderId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
          <option value="">All Providers</option>
          {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={loadReports} disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />} Run Report
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); if (financial.length === 0) loadReports() }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === t.key ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>}

      {!loading && (
        <>
          {/* Financial Tab */}
          {activeTab === 'financial' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Total Billed</p>
                  <p className="text-2xl font-bold text-slate-800">₦{financialTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Total Paid</p>
                  <p className="text-2xl font-bold text-emerald-600">₦{financialPaid.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Outstanding</p>
                  <p className="text-2xl font-bold text-amber-600">₦{Math.max(0, financialTotal - financialPaid).toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500">Collection Rate</p>
                  <p className="text-2xl font-bold text-blue-600">{financialTotal > 0 ? Math.round((financialPaid / financialTotal) * 100) : 0}%</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Cases</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Billed</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Invoiced</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Paid</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Balance</th>
                  </tr></thead>
                  <tbody>
                    {financial.map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium">{r.provider_name || r.provider_code}</td>
                        <td className="py-3 px-4 text-right">{r.case_count}</td>
                        <td className="py-3 px-4 text-right">₦{Number(r.total_billed || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">₦{Number(r.total_invoiced || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-emerald-600">₦{Number(r.total_paid || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-medium">₦{Math.max(0, Number(r.total_billed||0) - Number(r.total_paid||0)).toLocaleString()}</td>
                      </tr>
                    ))}
                    {financial.length === 0 && <tr><td colSpan={6} className="py-12 text-center text-slate-400">No financial data for this period</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Utilization Tab */}
          {activeTab === 'utilization' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Service Type</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Count</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-600">Total (₦)</th>
                </tr></thead>
                <tbody>
                  {utilization.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium capitalize">{r.service_type}</td>
                      <td className="py-3 px-4 text-right">{r.count}</td>
                      <td className="py-3 px-4 text-right font-medium">₦{Number(r.total || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  {utilization.length === 0 && <tr><td colSpan={3} className="py-12 text-center text-slate-400">No utilization data. Select a provider and run the report.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Aging Tab */}
          {activeTab === 'aging' && aging && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(Object.entries(aging.buckets) as [string, any][]).map(([key, val]: [string, any]) => (
                  <div key={key} className={`bg-white rounded-xl border border-slate-200 p-5 ${key === '90+' ? 'border-rose-200' : key === '61-90' ? 'border-amber-200' : ''}`}>
                    <p className="text-xs text-slate-500">{key} days</p>
                    <p className={`text-2xl font-bold ${key === '90+' ? 'text-rose-600' : key === '61-90' ? 'text-amber-600' : 'text-slate-800'}`}>₦{val.total.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">{val.count} invoice{val.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
                <p className="text-sm text-slate-500">Total Outstanding</p>
                <p className="text-3xl font-bold text-slate-800">₦{(aging.total_outstanding || 0).toLocaleString()}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
