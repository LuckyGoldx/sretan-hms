import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Eraser, Loader2, Lock, AlertTriangle, CheckCircle, Database, Building2,
  RefreshCw, ShieldAlert, ArrowRight, Layers
} from 'lucide-react'
import api from '../hooks/superadminApi'

interface ClearTable {
  name: string
  approx_rows: number
  is_locked: boolean
  selected_by_default: boolean
}

interface TenantOption { id: string; hospital_name: string }

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function SuperAdminClear() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tables, setTables] = useState<ClearTable[]>([])
  const [locked, setLocked] = useState<string[]>([])
  const [globalProtected, setGlobalProtected] = useState<string[]>([])
  const [keepDefault, setKeepDefault] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [scope, setScope] = useState<'tenant' | 'all'>('tenant')
  const [tenantId, setTenantId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [masterCode, setMasterCode] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadCatalog() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/superadmin/clear-catalog')
      const t = res.data.tables || []
      setTenants(res.data.tenants || [])
      setTables(t)
      setLocked(res.data.locked || [])
      setGlobalProtected(res.data.global_protected || [])
      setKeepDefault(res.data.keep_by_default || [])
      if ((res.data.tenants || []).length > 0) setTenantId(res.data.tenants[0].id)
      setSelected(new Set(t.filter((x: ClearTable) => !x.is_locked && x.selected_by_default).map((x: ClearTable) => x.name)))
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load tables')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCatalog() }, [])

  const selectable = useMemo(() => tables.filter((t) => !t.is_locked), [tables])

  function toggleTable(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAllData() {
    setSelected(new Set(selectable.map((t) => t.name)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  const canSubmit =
    !busy &&
    masterCode.trim().length > 0 &&
    confirmText.trim().toUpperCase() === 'CLEAR' &&
    selected.size > 0

  async function handleClear() {
    setBusy(true)
    setResult(null)
    try {
      const res = await api.post('/superadmin/clear-data', {
        tenant_id: scope === 'all' ? 'all' : tenantId,
        tables: Array.from(selected),
        master_code: masterCode.trim(),
      })
      setResult({ type: 'success', text: res.data.message || 'Cleared' })
      setMasterCode('')
      setConfirmText('')
      await loadCatalog()
    } catch (err: any) {
      setResult({ type: 'error', text: err.response?.data?.message || 'Clear failed' })
    } finally {
      setBusy(false)
    }
  }

  const scopeLabel = scope === 'all'
    ? 'ALL hospitals (tenants)'
    : tenants.find((t) => t.id === tenantId)?.hospital_name || 'selected hospital'

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-600/10 text-rose-600 flex items-center justify-center">
            <Eraser className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Clear Data (Reset)</h1>
            <p className="text-sm text-slate-500 mt-0.5">Empty data for one hospital or all hospitals — never the schema, hospitals, or users</p>
          </div>
        </div>
        <button onClick={() => navigate('/superadmin/backup')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-all">
          <Database className="w-4 h-4" /> Make a backup first
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 text-sm">
          <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Could not load the catalog</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 p-5 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">DANGER — this permanently deletes data.</p>
          <p className="text-rose-700 mt-1 leading-relaxed">
            Deleted rows cannot be recovered. Always <strong>Create Full Backup</strong> first and download the
            <code className="mx-1 px-1.5 py-0.5 rounded bg-rose-100 font-mono text-xs">.sbackup</code> file. This tool only
            deletes data <em>rows</em> from the tables you tick — it never drops tables, never removes the schema, never
            removes hospitals (<code className="mx-1 px-1.5 py-0.5 rounded bg-rose-100 font-mono text-xs">tenants</code>),
            hospital configurations, or SuperAdmin accounts.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">1. Which hospital's data?</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Choose ONE hospital (its own rows are removed, other hospitals are untouched) or ALL hospitals at once.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button onClick={() => setScope('tenant')}
                className={`text-left p-4 rounded-xl border transition-all ${scope === 'tenant' ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <input type="radio" checked={scope === 'tenant'} readOnly className="accent-blue-600" />
                  <span className="text-sm font-semibold text-slate-700">One hospital only</span>
                </div>
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={scope !== 'tenant'}
                  onClick={(e) => e.stopPropagation()}
                  className={`mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none ${scope !== 'tenant' ? 'opacity-50' : ''}`}>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.hospital_name}</option>
                  ))}
                </select>
              </button>
              <button onClick={() => setScope('all')}
                className={`text-left p-4 rounded-xl border transition-all ${scope === 'all' ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/40' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="flex items-center gap-2">
                  <input type="radio" checked={scope === 'all'} readOnly className="accent-rose-600" />
                  <span className="text-sm font-semibold text-slate-700">ALL hospitals (every tenant)</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">Clears the ticked tables across every hospital in this database. Hospitals themselves are kept.</p>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-800">2. Which tables to empty?</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{selected.size} selected</span>
                <button onClick={selectAllData} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all">All data tables</button>
                <button onClick={selectNone} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all">None</button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Untick the tables you want to <strong>keep</strong> (e.g. staff users, departments, audit history).
              Clearing a parent table automatically clears the records that belong to it (patients → encounters → vitals), so
              you only need to tick the top-level tables you want gone.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {locked.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium">
                  <Lock className="w-3 h-3" /> {name} — always kept
                </span>
              ))}
              {globalProtected.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-400 text-[10px] font-medium">
                  <Lock className="w-3 h-3" /> {name} — system
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
              {tables.map((t) => {
                const isLocked = t.is_locked
                const isDefaultKept = !isLocked && keepDefault.includes(t.name)
                const checked = selected.has(t.name)
                return (
                  <label key={t.name} onClick={(e) => { if (isLocked) e.preventDefault() }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-sm transition-all cursor-pointer ${
                      isLocked
                        ? 'border-slate-100 bg-slate-50 opacity-70 cursor-not-allowed'
                        : checked
                          ? 'border-rose-200 bg-rose-50/40 hover:bg-rose-50'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}>
                    <input type="checkbox" disabled={isLocked} checked={checked}
                      onChange={() => toggleTable(t.name)} className="accent-rose-600 flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className={`font-mono text-xs break-all ${isLocked ? 'text-slate-400' : 'text-slate-700'}`}>{t.name}</span>
                      <span className="block text-[10px] text-slate-400">{fmt(t.approx_rows)} rows</span>
                    </span>
                    {isLocked
                      ? <Lock className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                      : isDefaultKept && !checked
                        ? <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[9px] font-semibold flex-shrink-0">keep</span>
                        : checked
                          ? <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 text-[9px] font-semibold flex-shrink-0">clear</span>
                          : null}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">3. Confirm &amp; clear</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Scope: <strong className="text-slate-600">{scopeLabel}</strong> · {selected.size} table(s) will be emptied.
              Type the master code and the word <strong className="font-mono">CLEAR</strong> to enable the button. Every clear is
              written to the audit log.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Master code</label>
                <input type="password" value={masterCode} onChange={(e) => setMasterCode(e.target.value)}
                  placeholder="Enter the master code" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Type CLEAR to confirm</label>
                <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CLEAR" className={inputCls} />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleClear} disabled={!canSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                {busy ? 'Clearing…' : 'Clear selected data'}
              </button>
              {!canSubmit && selected.size > 0 && (
                <span className="text-[11px] text-slate-400">
                  {masterCode ? (confirmText.trim().toUpperCase() !== 'CLEAR' ? 'Type CLEAR above to confirm' : '') : 'Enter the master code to enable'}
                </span>
              )}
            </div>
            {result && (
              <div className={`mt-4 flex items-start gap-2 p-4 rounded-xl border text-sm ${
                result.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                {result.type === 'success'
                  ? <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span>{result.text}</span>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 p-5 rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
            <Layers className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-slate-600 mb-1">Important notes</p>
              <ul className="list-disc ml-4 space-y-1">
                <li>Only <strong>data rows</strong> are removed. The schema, tables, hospitals, hospital settings, and
                  SuperAdmin accounts are never touched.</li>
                <li>Cloud (Supabase) copies are <strong>not</strong> removed by this tool — the cloud keeps its own records.
                  If you need the cloud copies gone too, delete them in Supabase (this tool is for the local database).</li>
                <li>Every clear is logged in the audit log with the scope, tables, row counts, and who did it.</li>
                <li>New data written after a clear syncs to the cloud normally. For a fully clean cloud state, use a fresh
                  Supabase project or delete the old rows there.</li>
                <li>If in doubt: <button onClick={() => navigate('/superadmin/backup')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium">
                  make a backup <ArrowRight className="w-3 h-3" /></button> first — restoring is your undo button.</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
