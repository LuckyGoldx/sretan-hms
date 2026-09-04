import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RadioTower, RefreshCw, Search, ChevronDown, ChevronRight, Copy,
  CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, GitBranch,
  Cloud, Server, WifiOff, ShieldAlert, CheckCheck, Ban, ArrowRight
} from 'lucide-react'
import api from '../hooks/superadminApi'

interface FleetRow {
  tenant_id: string | null
  machine_id: string | null
  hospital_name: string
  deployment_mode: string
  branch: string
  local_sha: string | null
  remote_sha: string | null
  last_commit: string | null
  update_available: boolean
  auto_update_enabled: boolean
  interval_minutes: number | null
  cloud_version: string | null
  local_signal_version: string | null
  repo_url_clean: string | null
  last_check_at: string | null
  last_pull_at: string | null
  last_pull_ok: boolean | null
  last_pull_error: string | null
  last_pull_output: string | null
  last_phone_at: string | null
  last_phone_ok: boolean | null
  last_phone_error: string | null
  updated_at: string | null
  source: string
}

const STALE_MS = 24 * 60 * 60 * 1000

function shortSha(sha: string | null, len = 10): string {
  return sha ? sha.slice(0, len) : '—'
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const diff = Date.now() - d
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} hr ago`
  const days = Math.floor(h / 24)
  return `${days} d ago`
}

type StatusKey = 'all' | 'current' | 'pending' | 'failed' | 'stale' | 'phone_retry' | 'auto_off'

function classifyRow(r: FleetRow): StatusKey {
  if (r.last_pull_ok === false) return 'failed'
  if (r.update_available) return 'pending'
  if (r.last_phone_ok === false) return 'phone_retry'
  return 'current'
}

function StatusBadge({ status, row }: { status: StatusKey; row: FleetRow }) {
  const map: Record<string, { label: string; cls: string }> = {
    current: { label: 'Up to date', cls: 'bg-emerald-100 text-emerald-700' },
    pending: { label: 'Update pending', cls: 'bg-amber-100 text-amber-700' },
    failed: { label: 'Pull failed', cls: 'bg-rose-100 text-rose-700' },
    phone_retry: { label: 'Report retrying', cls: 'bg-orange-100 text-orange-700' },
    auto_off: { label: 'Auto-update OFF', cls: 'bg-slate-200 text-slate-600' },
    stale: { label: 'Stale (>24h)', cls: 'bg-slate-100 text-slate-500' },
    all: { label: 'All', cls: 'bg-blue-100 text-blue-700' },
  }
  const stale = row.updated_at && Date.now() - new Date(row.updated_at).getTime() > STALE_MS
  const key = stale && status !== 'failed' && status !== 'pending' ? 'stale' : status
  const cfg = map[key]
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cfg.cls}`}>{cfg.label}</span>
}

function ModeBadge({ mode }: { mode: string }) {
  const map: Record<string, { label: string; icon: any; cls: string }> = {
    CLOUD_SAAS: { label: 'Cloud SaaS', icon: Cloud, cls: 'text-blue-600 bg-blue-50 border-blue-200' },
    PRIVATE_SUPABASE: { label: 'Private Cloud', icon: Server, cls: 'text-purple-600 bg-purple-50 border-purple-200' },
    OFFLINE_STANDALONE: { label: 'Offline', icon: WifiOff, cls: 'text-slate-500 bg-slate-100 border-slate-200' },
  }
  const cfg = map[mode] || map.OFFLINE_STANDALONE
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  )
}

export default function SuperAdminFleet() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [rollouts, setRollouts] = useState<Record<string, { busy: boolean; msg: string; ok: boolean }>>({})

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/superadmin/fleet')
      setData(res.data)
      setError('')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load fleet status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(fetchData, 60000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchData])

  const rows: FleetRow[] = useMemo(() => (data?.rows || []).filter((r: FleetRow) => r.machine_id), [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all') {
        const st = classifyRow(r)
        if (statusFilter === 'auto_off') {
          if (!r.auto_update_enabled) return qMatches(r, q)
          return false
        }
        if (st !== statusFilter) return false
      }
      return qMatches(r, q)
    })
  }, [rows, statusFilter, search])

  const summary = data?.summary

  const filters: { key: StatusKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'current', label: 'Up to date' },
    { key: 'pending', label: 'Update pending' },
    { key: 'failed', label: 'Pull failed' },
    { key: 'stale', label: 'Stale' },
    { key: 'phone_retry', label: 'Report retrying' },
    { key: 'auto_off', label: 'Auto-update off' },
  ]

  const statCards: { key: StatusKey; label: string; value: number; icon: any; accent: string }[] = [
    { key: 'current', label: 'Up to date', value: summary?.up_to_date ?? 0, icon: CheckCircle2, accent: 'text-emerald-600' },
    { key: 'pending', label: 'Update pending', value: summary?.update_pending ?? 0, icon: AlertTriangle, accent: 'text-amber-600' },
    { key: 'failed', label: 'Pull failed', value: summary?.pull_failed ?? 0, icon: XCircle, accent: 'text-rose-600' },
    { key: 'stale', label: 'Stale (>24h)', value: summary?.stale ?? 0, icon: Clock, accent: 'text-slate-600' },
    { key: 'auto_off', label: 'Auto-update off', value: summary?.auto_update_off ?? 0, icon: Ban, accent: 'text-slate-500' },
  ]

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {}
  }

  async function handleRollout(row: FleetRow) {
    if (!row.tenant_id) return
    const key = `${row.tenant_id}|${row.machine_id}`
    setRollouts((r) => ({ ...r, [key]: { busy: true, msg: '', ok: true } }))
    try {
      const res = await api.post('/superadmin/publish-update', { tenant_id: row.tenant_id })
      setRollouts((r) => ({ ...r, [key]: { busy: false, msg: res.data.message || 'Release sent', ok: true } }))
      setTimeout(() => fetchData(), 3000)
    } catch (err: any) {
      setRollouts((r) => ({ ...r, [key]: { busy: false, msg: err.response?.data?.message || 'Send failed', ok: false } }))
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
            <RadioTower className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Fleet &amp; Roll-out Monitor</h1>
            <p className="text-sm text-slate-500 mt-0.5">Live update status of every hospital host across the platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            {data?.source === 'cloud' && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium flex items-center gap-1"><Cloud className="w-3 h-3" /> Cloud view</span>}
            {data?.source === 'local' && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">Local machines</span>}
            {data?.source === 'none' && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">No data source</span>}
            {data?.generated_at && <span className="hidden md:inline text-slate-400">updated {relTime(data.generated_at)}</span>}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-blue-600" />
            Auto-refresh 60s
          </label>
          <button onClick={fetchData} disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {data?.source && data.source !== 'cloud' && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-sky-200 bg-sky-50 text-sky-800 text-sm">
          <RadioTower className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-1">Showing local reports only — no cloud view yet</p>
            <p className="leading-relaxed">
              The <strong>Roll out</strong> button (send an update to one hospital) only appears on rows that come from the
              shared <strong>Cloud SaaS</strong> project. To get there: (1) create/point this console at a Supabase project and
              save its URL + anon key in <strong>Cloud &amp; Sync → Deployment</strong>, (2) make sure the hospital's deployment
              mode is <strong>Cloud SaaS</strong> and its tenant is active, and (3) re-run the schema SQL in Supabase so
              <code className="mx-1 px-1 py-0.5 rounded bg-sky-100 text-[11px] font-mono">machine_update_reports</code> exists.
              Hospitals then phone home and appear here as <strong>cloud</strong> rows within a minute or two.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-sm">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-1">Could not load fleet status</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {data?.error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 text-sm">
          <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-1">Cloud read issue</p>
            <p>{data.error}</p>
            <p className="text-xs mt-1 text-amber-600/80">Local machine reports are still shown below where available.</p>
          </div>
        </div>
      )}

      {!loading && !data?.error && rows.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
          <RadioTower className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-700 mb-1">No hospital hosts reporting yet</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            Every hospital host phones home its applied commit once it runs the version with the update-report
            daemon and cloud sync is enabled (Cloud SaaS or Private Cloud). Reports arrive within minutes of the
            next update cycle.
          </p>
          <div className="mt-5 text-left max-w-xl mx-auto bg-slate-50 rounded-xl border border-slate-200 p-4 text-xs text-slate-500 space-y-1.5">
            <p className="font-semibold text-slate-600">To start monitoring:</p>
            <p>1. Deploy code with the machine-update report (migration 065) to the hospitals.</p>
            <p>2. Re-run the updated schema SQL in Supabase so <code className="font-mono">machine_update_reports</code> exists in the cloud.</p>
            <p>3. Enable Cloud SaaS / Private Cloud per hospital and confirm auto-update on each host.</p>
          </div>
        </div>
      )}

      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {statCards.map(({ key, label, value, icon: Icon, accent }) => (
            <button key={key} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              className={`bg-white rounded-2xl border shadow-sm p-4 text-left transition-all hover:shadow-md ${statusFilter === key ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${accent}`} />
                <span className="text-[10px] text-slate-400">{summary.total} hosts total</span>
              </div>
              <p className="text-3xl font-bold text-slate-800">{value}</p>
              <p className="text-[11px] text-slate-500 mt-1">{label}</p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Hospital hosts</h2>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hospital, machine, commit…"
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm w-72 max-w-full focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {filters.map(({ key, label }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                statusFilter === key
                  ? key === 'failed' ? 'bg-rose-600 text-white' : key === 'pending' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {label}
            </button>
          ))}
          {search && <span className="text-[11px] text-slate-400 self-center ml-1">{filtered.length} matching</span>}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No hosts match the current filter.</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-left text-xs min-w-[980px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400">
                  <th className="py-2 pr-3 font-medium w-6"></th>
                  <th className="py-2 pr-3 font-medium">Hospital / Mode</th>
                  <th className="py-2 pr-3 font-medium">Branch</th>
                  <th className="py-2 pr-3 font-medium">Applied commit</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Last pull</th>
                  <th className="py-2 pr-3 font-medium">Reported</th>
                  <th className="py-2 pr-3 font-medium">Auto-update</th>
                  <th className="py-2 font-medium">Roll out</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const st = classifyRow(row)
                  const stale = !!(row.updated_at && Date.now() - new Date(row.updated_at).getTime() > STALE_MS)
                  const key = `${row.tenant_id || ''}|${row.machine_id || ''}|${i}`
                  const isOpen = expanded === key
                  const rkey = `${row.tenant_id}|${row.machine_id}`
                  return (
                    <FleetRowGroup key={key} row={row} st={st} stale={stale} isOpen={isOpen}
                      copied={copied} copyText={copyText} toggle={() => setExpanded(isOpen ? null : key)}
                      canRollout={row.source === 'cloud' && !!row.tenant_id}
                      rollout={rollouts[rkey]}
                      onRollout={() => handleRollout(row)} />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">How to read this page</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-500">
          <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> <strong className="text-slate-600">Up to date</strong> — the host's applied commit equals its remote branch head (no update available).</li>
          <li className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> <strong className="text-slate-600">Update pending</strong> — newer code exists on the branch but auto-update hasn't pulled it yet (often offline at check time; it self-heals).</li>
          <li className="flex items-center gap-2"><XCircle className="w-3.5 h-3.5 text-rose-500" /> <strong className="text-slate-600">Pull failed</strong> — the last <code className="font-mono">git pull --ff-only</code> errored. Expand the row for the exact error (offline, conflict, or credential).</li>
          <li className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-400" /> <strong className="text-slate-600">Stale</strong> — no report for over 24 hours; the host may be powered off or disconnected from the internet.</li>
          <li className="flex items-center gap-2"><Ban className="w-3.5 h-3.5 text-slate-400" /> <strong className="text-slate-600">Auto-update off</strong> — the host only updates when someone clicks "Pull Latest Code" on that machine.</li>
          <li className="flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5 text-orange-500" /> <strong className="text-slate-600">Report retrying</strong> — the machine's report row has not reached the cloud yet (offline / schema not re-run); retried on every cycle.</li>
          <li className="flex items-center gap-2"><ArrowRight className="w-3.5 h-3.5 text-blue-500" /> <strong className="text-slate-600">Roll out</strong> — sends a <em>targeted</em> release signal to that one hospital (only its host pulls), unlike the global "Publish Update" on the Cloud page which sends to every hospital.</li>
        </ul>
        <p className="text-[11px] text-slate-400 mt-4">
          A host is "on the latest code" when its applied commit equals the remote head of the branch it follows. All cloud-connected
          hospitals push their reports into the same Cloud SaaS project, so this page shows the entire platform. Offline Standalone
          hospitals (no cloud) never appear — that is by design.
        </p>
      </div>
    </div>
  )
}

function qMatches(r: FleetRow, q: string): boolean {
  if (!q) return true
  return [
    r.hospital_name, r.machine_id, r.branch, r.local_sha, r.remote_sha,
    r.last_commit, r.deployment_mode, r.repo_url_clean,
  ].some((v) => v && String(v).toLowerCase().includes(q))
}

function FleetRowGroup({ row, st, stale, isOpen, copied, copyText, toggle, canRollout, rollout, onRollout }: {
  row: FleetRow
  st: StatusKey
  stale: boolean
  isOpen: boolean
  copied: string | null
  copyText: (text: string, key: string) => void
  toggle: () => void
  canRollout: boolean
  rollout?: { busy: boolean; msg: string; ok: boolean }
  onRollout: () => void
}) {
  return (
    <>
      <tr onClick={toggle} className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${stale && st !== 'failed' && st !== 'pending' ? 'opacity-70' : ''}`}>
        <td className="py-3 pr-2 text-slate-300">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-800">{row.hospital_name || 'Unknown hospital'}</span>
            <ModeBadge mode={row.deployment_mode} />
            {row.source === 'cloud' ? (
              <span className="text-[9px] uppercase tracking-wide text-blue-400 font-semibold" title="Reported via cloud phone-home">cloud</span>
            ) : (
              <span className="text-[9px] uppercase tracking-wide text-slate-400 font-semibold" title="Read from this console's local database">local</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[10px] text-slate-400">{String(row.machine_id || '').slice(0, 12)}</span>
            {row.last_commit && <span className="text-[10px] text-slate-400 truncate max-w-[240px]">{row.last_commit}</span>}
          </div>
        </td>
        <td className="py-3 pr-3">
          <span className="font-mono text-[11px] text-slate-600">{row.branch || '—'}</span>
          {row.repo_url_clean && <div className="text-[9px] text-slate-400 font-mono truncate max-w-[140px]" title={row.repo_url_clean}>{row.repo_url_clean}</div>}
        </td>
        <td className="py-3 pr-3">
          <button onClick={(e) => { e.stopPropagation(); if (row.local_sha) copyText(row.local_sha, `sha-${row.machine_id}`) }}
            className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 group" title="Copy full SHA">
            {shortSha(row.local_sha)}
            {copied === `sha-${row.machine_id}` ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-300 group-hover:text-slate-500" />}
          </button>
          {row.update_available && row.remote_sha && (
            <div className="text-[9px] text-slate-400 font-mono mt-0.5">remote {shortSha(row.remote_sha)}</div>
          )}
        </td>
        <td className="py-3 pr-3"><StatusBadge status={st} row={row} /></td>
        <td className="py-3 pr-3">
          {row.last_pull_at ? (
            <>
              <span className={`font-semibold text-[10px] ${row.last_pull_ok === false ? 'text-rose-600' : 'text-emerald-600'}`}>
                {row.last_pull_ok === false ? 'FAILED' : 'OK'}
              </span>
              <div className="text-[10px] text-slate-400">{relTime(row.last_pull_at)}</div>
              {row.last_pull_ok === false && row.last_pull_error && (
                <div className="text-[9px] text-rose-400 max-w-[160px] truncate" title={row.last_pull_error}>{row.last_pull_error}</div>
              )}
            </>
          ) : (
            <span className="text-slate-300">never</span>
          )}
        </td>
        <td className="py-3 pr-3">
          <div className="text-[11px] text-slate-600">{relTime(row.updated_at)}</div>
          {row.last_phone_at ? (
            <span className={`text-[10px] ${row.last_phone_ok === false ? 'text-orange-500' : 'text-slate-400'}`}>
              {row.last_phone_ok === false ? 'phone retrying' : 'phoned home'}
            </span>
          ) : (
            <span className="text-[10px] text-slate-300">not reported</span>
          )}
        </td>
        <td className="py-3">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${row.auto_update_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {row.auto_update_enabled ? `ON (${row.interval_minutes ?? 1}m)` : 'OFF'}
          </span>
        </td>
        <td className="py-3 pr-3">
          {canRollout && (
            <button
              onClick={(e) => { e.stopPropagation(); onRollout() }}
              disabled={rollout?.busy}
              title={rollout?.busy ? 'Sending…' : 'Send targeted release signal to this hospital only'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                rollout?.busy
                  ? 'bg-slate-100 text-slate-400 cursor-wait'
                  : rollout?.ok === false
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                    : rollout?.msg
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}>
              {rollout?.busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              {rollout?.busy ? 'Sending…' : rollout?.msg ? 'Sent' : 'Roll out'}
            </button>
          )}
          {rollout?.msg && <div className="text-[9px] text-slate-400 mt-0.5 max-w-[150px]" title={rollout.msg}>{rollout.msg}</div>}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td></td>
          <td colSpan={8} className="py-4 pr-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-3">
              <Detail label="Applied commit (local SHA)">
                <MonoRow text={row.local_sha} onCopy={row.local_sha ? () => copyText(row.local_sha!, `d-sha-${row.machine_id}`) : undefined} copied={copied === `d-sha-${row.machine_id}`} />
              </Detail>
              <Detail label="Remote head SHA">
                <MonoRow text={row.remote_sha} onCopy={row.remote_sha ? () => copyText(row.remote_sha!, `d-rs-${row.machine_id}`) : undefined} copied={copied === `d-rs-${row.machine_id}`} />
              </Detail>
              <Detail label="Last commit message">
                <p className="text-xs text-slate-600">{row.last_commit || '—'}</p>
              </Detail>
              <Detail label="Branch & repository">
                <p className="text-xs font-mono text-slate-600 break-all">{row.branch || '—'} · {row.repo_url_clean || '—'}</p>
              </Detail>
              <Detail label="Deployment mode / tenant">
                <p className="text-xs text-slate-600">{row.deployment_mode} · <span className="font-mono text-[10px]">{row.tenant_id || 'no tenant'}</span></p>
              </Detail>
              <Detail label="Last check / last report">
                <p className="text-xs text-slate-600">{row.last_check_at ? new Date(row.last_check_at).toLocaleString() : '—'} · updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</p>
              </Detail>
              <Detail label="Cloud release signal">
                <p className="text-xs text-slate-600 font-mono text-[10px] break-all">{row.cloud_version || 'none'} {row.local_signal_version && <span className="text-slate-400">(local {row.local_signal_version})</span>}</p>
              </Detail>
              <Detail label="Pull outcome">
                {row.last_pull_at ? (
                  <div>
                    <p className={`text-xs font-semibold ${row.last_pull_ok === false ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {row.last_pull_ok === false ? 'FAILED' : 'OK'} — {new Date(row.last_pull_at).toLocaleString()}
                    </p>
                    {row.last_pull_error && <p className="text-[11px] text-rose-500 mt-1 break-all">{row.last_pull_error}</p>}
                    {row.last_pull_output && row.last_pull_output.trim() && row.last_pull_output !== row.last_pull_error && (
                      <pre className="mt-1.5 bg-slate-900 text-emerald-200 text-[10px] leading-relaxed p-2 rounded-lg overflow-auto max-h-28 font-mono whitespace-pre-wrap break-all">{row.last_pull_output}</pre>
                    )}
                  </div>
                ) : <p className="text-xs text-slate-400">Never pulled on this host yet.</p>}
              </Detail>
              <Detail label="Phone home">
                {row.last_phone_at ? (
                  <div>
                    <p className={`text-xs font-semibold ${row.last_phone_ok === false ? 'text-orange-600' : 'text-emerald-600'}`}>
                      {row.last_phone_ok === false ? 'FAILED (retrying)' : 'Reported'} — {new Date(row.last_phone_at).toLocaleString()}
                    </p>
                    {row.last_phone_ok === false && row.last_phone_error && <p className="text-[11px] text-orange-500 mt-1 break-all">{row.last_phone_error}</p>}
                  </div>
                ) : <p className="text-xs text-slate-400">No cloud phone-home yet (offline standalone hosts stay local by design).</p>}
              </Detail>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  )
}

function MonoRow({ text, onCopy, copied }: { text: string | null; onCopy?: () => void; copied: boolean }) {
  if (!text) return <p className="text-xs text-slate-400">—</p>
  return (
    <button onClick={onCopy} className="flex items-center gap-1.5 group" title="Copy">
      <span className="text-xs font-mono text-slate-600 break-all">{text}</span>
      {copied ? <CheckCheck className="w-3 h-3 text-emerald-500 flex-shrink-0" /> : onCopy && <Copy className="w-3 h-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />}
    </button>
  )
}
