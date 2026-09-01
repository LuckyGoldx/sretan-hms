import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Users, Stethoscope, FileText, Shield, Database,
  Loader2, RefreshCw, CheckCircle, ArrowRight, Server
} from 'lucide-react'
import api from '../hooks/superadminApi'

interface Overview {
  stats: {
    total_tenants: number
    total_staff: number
    total_patients: number
    total_encounters: number
    total_prescriptions: number
    total_lab_orders: number
    total_radiology_orders: number
    total_superadmins: number
  }
  active_tenant: { tenant_id: string; hospital_name: string; deployment_mode: string } | null
  backups: { count: number; last: any | null }
  server_time: string
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function SuperAdminOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [backingUp, setBackingUp] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')

  async function fetchData() {
    setLoading(true)
    try {
      const res = await api.get('/superadmin/overview')
      setData(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  async function handleBackup() {
    setBackingUp(true)
    setBackupMsg('')
    try {
      const res = await api.post('/superadmin/backup')
      setBackupMsg(`Backup created: ${res.data.name}`)
      await fetchData()
    } catch (err: any) {
      setBackupMsg(err.response?.data?.message || 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  const stats = data?.stats

  const cards = [
    { label: 'Hospitals', value: stats?.total_tenants ?? 0, icon: Building2, tint: 'bg-blue-100 text-blue-600' },
    { label: 'Staff', value: stats?.total_staff ?? 0, icon: Users, tint: 'bg-emerald-100 text-emerald-600' },
    { label: 'Patients', value: stats?.total_patients ?? 0, icon: Stethoscope, tint: 'bg-amber-100 text-amber-600' },
    { label: 'Encounters', value: stats?.total_encounters ?? 0, icon: FileText, tint: 'bg-violet-100 text-violet-600' },
    { label: 'Super Admins', value: stats?.total_superadmins ?? 0, icon: Shield, tint: 'bg-slate-100 text-slate-600' },
    { label: 'Backups', value: data?.backups?.count ?? 0, icon: Database, tint: 'bg-sky-100 text-sky-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Global system summary and quick actions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-all"
          >
            {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            {backingUp ? 'Creating...' : 'Create Backup'}
          </button>
          <button
            onClick={() => navigate('/superadmin/setup')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-all"
          >
            <Building2 className="w-4 h-4" />
            Setup Hospital
          </button>
        </div>
      </div>

      {backupMsg && (
        <div className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
          backupMsg.includes(':') || backupMsg.includes('created') || backupMsg.includes('success')
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {backupMsg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.tint}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{c.value}</p>
            <p className="text-xs text-slate-500 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Active Hospital</h2>
          </div>
          {data?.active_tenant ? (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold text-slate-800">{data.active_tenant.hospital_name}</p>
                <p className="text-xs text-slate-400 font-mono">{data.active_tenant.tenant_id}</p>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                {data.active_tenant.deployment_mode}
              </span>
              <div className="pt-2">
                <button
                  onClick={() => navigate('/superadmin/hospitals')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all"
                >
                  Switch / Manage Hospitals
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No active hospital set.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-semibold text-slate-800">Latest Backup</h2>
          </div>
          {data?.backups?.last ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 break-all">{data.backups.last.name}</p>
              <p className="text-xs text-slate-500">
                {new Date(data.backups.last.modified_at).toLocaleString()} · {formatBytes(data.backups.last.size)} ·{' '}
                {data.backups.last.manifest?.tables?.length ?? '?'} tables
              </p>
              <div className="pt-2">
                <button
                  onClick={() => navigate('/superadmin/backup')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all"
                >
                  Backup &amp; Restore
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              <p>No backups yet.</p>
              <button
                onClick={handleBackup}
                disabled={backingUp}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-all"
              >
                {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Create your first backup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
