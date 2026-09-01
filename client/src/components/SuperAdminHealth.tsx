import { useState, useEffect } from 'react'
import { Gauge, Database, Loader2, Server, HardDrive, Activity } from 'lucide-react'
import api from '../hooks/superadminApi'

interface Health {
  db: { connected: boolean; latency_ms: number }
  tables: Array<{ table_name: string; row_estimate: string; size: string }>
  migrations: { available: number; files: string[] }
  backups: { count: number; total_size: number; last: any | null }
  tenants_by_tier: Array<{ subscription_tier: string; count: number }>
  system: {
    node_version: string
    platform: string
    arch: string
    uptime_seconds: number
    memory_mb: number
    server_time: string
  }
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function SuperAdminHealth() {
  const [data, setData] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/superadmin/health')
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  const cards = [
    {
      label: 'Database',
      value: data?.db.connected ? 'Connected' : 'Disconnected',
      sub: data?.db.connected ? `${data.db.latency_ms} ms latency` : '—',
      icon: Database,
      tint: data?.db.connected ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600',
    },
    { label: 'Tables', value: data?.tables.length ?? 0, sub: 'public schema', icon: Server, tint: 'bg-blue-100 text-blue-600' },
    { label: 'Migrations', value: data?.migrations.available ?? 0, sub: 'SQL files available', icon: Activity, tint: 'bg-amber-100 text-amber-600' },
    {
      label: 'Backup Storage',
      value: `${data?.backups.count ?? 0}`,
      sub: `${formatBytes(data?.backups.total_size || 0)} total`,
      icon: HardDrive,
      tint: 'bg-violet-100 text-violet-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Health</h1>
        <p className="text-sm text-slate-500 mt-1">Database, migrations, backups, and runtime status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.tint}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <p className="text-xl font-bold text-slate-800">{c.value}</p>
            <p className="text-xs text-slate-500 font-medium">{c.label}</p>
            {c.sub && <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Runtime</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Node.js</dt><dd className="font-medium text-slate-700">{data?.system.node_version}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Platform</dt><dd className="font-medium text-slate-700">{data?.system.platform} / {data?.system.arch}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Uptime</dt><dd className="font-medium text-slate-700">{(data?.system.uptime_seconds ?? 0) / 60 >= 60 ? `${Math.floor((data?.system.uptime_seconds ?? 0) / 3600)}h ${Math.floor(((data?.system.uptime_seconds ?? 0) % 3600) / 60)}m` : `${Math.round((data?.system.uptime_seconds ?? 0) / 60)} min`}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Memory (RSS)</dt><dd className="font-medium text-slate-700">{data?.system.memory_mb} MB</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Server Time</dt><dd className="font-medium text-slate-700">{data ? new Date(data.system.server_time).toLocaleString() : '—'}</dd></div>
          </dl>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Tenants by Tier</h3>
            {data?.tenants_by_tier.length ? (
              <div className="flex flex-wrap gap-2">
                {data.tenants_by_tier.map((t) => (
                  <span key={t.subscription_tier} className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                    {t.subscription_tier}: {t.count}
                  </span>
                ))}
              </div>
            ) : <p className="text-xs text-slate-400">No tenants</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Tables ({data?.tables.length})</h2>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Table</th>
                  <th className="px-4 py-2 font-medium text-right">Rows</th>
                  <th className="px-4 py-2 font-medium text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {data?.tables.map((t) => (
                  <tr key={t.table_name} className="border-t border-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-700">{t.table_name}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{t.row_estimate && t.row_estimate !== '-1' ? t.row_estimate : '0'}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{t.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data?.backups.last && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-2">Latest Backup</h2>
          <p className="text-sm text-slate-600 break-all">{data.backups.last.name}</p>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(data.backups.last.modified_at).toLocaleString()} · {formatBytes(data.backups.last.size)}
          </p>
        </div>
      )}
    </div>
  )
}
