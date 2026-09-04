import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cloud, Server, WifiOff, Save, Loader2, CheckCircle, Database, ShieldCheck, ArrowRight,
  GitBranch, RefreshCw, Settings2, FileCode2, Eye as EyeIcon, EyeOff as EyeOffIcon,
  KeyRound, Link2, ShieldAlert, Radio, CheckCheck
} from 'lucide-react'
import api from '../hooks/superadminApi'
import SchemaSqlViewer from './SchemaSqlViewer'
import SchemaUpdateBanner from './SchemaUpdateBanner'

export default function SuperAdminCloud() {
  const [tab, setTab] = useState<'deployment' | 'update' | 'schema'>('deployment')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Cloud className="w-6 h-6 text-slate-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cloud &amp; Sync</h1>
          <p className="text-sm text-slate-500 mt-0.5">Global cloud configuration for the whole platform</p>
        </div>
      </div>

      <SchemaUpdateBanner />

      <div className="flex gap-2 border-b border-slate-200">
        {([
          { key: 'deployment', label: 'Deployment', icon: Cloud },
          { key: 'update', label: 'Software Update', icon: GitBranch },
          { key: 'schema', label: 'Cloud Database Schema', icon: FileCode2 },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white border border-b-0 border-slate-200 text-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'deployment' && <DeploymentTab />}
      {tab === 'update' && <UpdateTab />}
      {tab === 'schema' && <SchemaTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deployment tab
// ---------------------------------------------------------------------------

function DeploymentTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    api.get('/superadmin/settings')
      .then((res) => {
        setUrl(res.data.cloud_saas_supabase_url || '')
        setAnonKey(res.data.cloud_saas_anon_key || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      await api.put('/superadmin/settings', {
        cloud_saas_supabase_url: url.trim(),
        cloud_saas_anon_key: anonKey.trim(),
      })
      setMessage('Cloud SaaS credentials saved. Hospitals in Cloud SaaS mode will sync to this project.')
    } catch (err: any) {
      setMessage(err.response?.data?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
            <WifiOff className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Offline Standalone</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Hospitals run fully locally. No cloud sync. The default.</p>
        </div>
        <div className="p-4 rounded-xl border border-blue-300 bg-blue-50">
          <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-2">
            <Cloud className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-blue-700">Cloud SaaS</p>
          <p className="text-[11px] text-blue-600/80 mt-1 leading-relaxed">Hospitals sync to ONE central Supabase project configured below — set here once, used by every hospital in Cloud SaaS mode.</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-2">
            <Server className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Private Cloud (Supabase)</p>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">Each hospital uses its OWN Supabase project (URL + key set in the hospital's Settings).</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Cloud SaaS — Global Provider Credentials</h2>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Platform-wide credentials used by any hospital whose Deployment mode is <strong>Cloud SaaS</strong>.
          A hospital is in exactly one mode (Cloud SaaS, Private Cloud, or Offline) — they never conflict.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Supabase Project URL</label>
                <input type="text" value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Anon Public Key</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={anonKey} onChange={(e) => setAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIs..." className={`${inputCls} pr-11 font-mono`} />
                  <button type="button" onClick={() => setShowKey((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    title={showKey ? 'Hide key' : 'Show key'}>
                    {showKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                style={{ backgroundColor: 'var(--primary-color)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Credentials'}
              </button>
              {message && (
                <span className={`text-sm font-medium flex items-center gap-1 ${message.includes('saved') ? 'text-emerald-600' : 'text-rose-600'}`}>
                  <CheckCircle className="w-4 h-4" />
                  {message}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Software Update tab
// ---------------------------------------------------------------------------

function UpdateTab() {
  const navigate = useNavigate()
  const [updating, setUpdating] = useState(false)
  const [updateOutput, setUpdateOutput] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [intervalMin, setIntervalMin] = useState(1)
  const [savingAuto, setSavingAuto] = useState(false)
  const [autoMsg, setAutoMsg] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [saasUrl, setSaasUrl] = useState('')
  const [saasKey, setSaasKey] = useState('')

  useEffect(() => {
    api.get('/superadmin/settings')
      .then((res) => {
        setAutoUpdate(res.data.auto_update_enabled === 'true')
        setIntervalMin(parseInt(res.data.auto_update_interval_minutes || '1', 10) || 1)
        setSaasUrl(res.data.cloud_saas_supabase_url || '')
        setSaasKey(res.data.cloud_saas_anon_key || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!saasUrl) return
    let active = true
    const loadFleet = async () => {
      try {
        const res = await api.get('/superadmin/fleet')
        if (active) {
          setFleet(res.data || null)
          setFleetMsg('')
        }
      } catch (err: any) {
        if (active) {
          setFleet(null)
          setFleetMsg(err.response?.data?.message || 'Could not load fleet status')
        }
      }
    }
    loadFleet()
    return () => { active = false }
  }, [saasUrl])

  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('')
  const [gitConfig, setGitConfig] = useState<any>(null)
  const [gitMsg, setGitMsg] = useState('')
  const [gitMsgType, setGitMsgType] = useState<'ok' | 'err'>('ok')
  const [verify, setVerify] = useState<any>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [gitSaving, setGitSaving] = useState(false)
  const [fleet, setFleet] = useState<any>(null)
  const [fleetMsg, setFleetMsg] = useState('')

  useEffect(() => {
    api.get('/superadmin/git-config')
      .then((res) => {
        setGitConfig(res.data)
        setGitUrl(res.data.remote_url_setting || res.data.origin_url || '')
        setGitBranch(res.data.branch_setting || '')
      })
      .catch(() => {})
  }, [])

  async function handleSaveGitConfig() {
    setGitSaving(true)
    setGitMsg('')
    try {
      const res = await api.put('/superadmin/git-config', { remote_url: gitUrl.trim(), branch: gitBranch.trim() })
      setGitMsg(res.data.message || 'Saved')
      setGitMsgType('ok')
      const cfg = await api.get('/superadmin/git-config')
      setGitConfig(cfg.data)
    } catch (err: any) {
      setGitMsg(err.response?.data?.message || 'Failed to save')
      setGitMsgType('err')
    } finally {
      setGitSaving(false)
    }
  }

  async function handleVerifyGit() {
    setVerifyLoading(true)
    setVerify(null)
    try {
      const res = await api.post('/superadmin/git-verify')
      setVerify(res.data)
    } catch (err: any) {
      setVerify({ reachable: false, message: err.response?.data?.message || 'Verify failed' })
    } finally {
      setVerifyLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    let timer: ReturnType<typeof setInterval> | null = null
    const startTimer = () => {
      if (timer) clearInterval(timer)
      timer = setInterval(fetchStatus, 30000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) { clearInterval(timer); timer = null }
      } else {
        fetchStatus()
        startTimer()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    startTimer()
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  async function fetchStatus() {
    try {
      const res = await api.get('/superadmin/update-status')
      setStatus(res.data)
    } catch {}
  }

  async function handleCheckNow() {
    try {
      const res = await api.post('/superadmin/update-check')
      setStatus(res.data)
    } catch {}
  }

  async function handleGitUpdate() {
    setUpdating(true)
    setUpdateMsg('')
    setUpdateOutput('')
    try {
      const res = await api.post('/superadmin/git-update')
      setUpdateMsg(res.data.message || 'Repository updated')
      setUpdateOutput(res.data.output || '')
      await fetchStatus()
    } catch (err: any) {
      setUpdateMsg(err.response?.data?.message || 'Update failed')
      setUpdateOutput(err.response?.data?.output || '')
    } finally {
      setUpdating(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setPublishMsg('')
    try {
      const res = await api.post('/superadmin/publish-update')
      setPublishMsg(res.data.message || 'Release published')
    } catch (err: any) {
      setPublishMsg(err.response?.data?.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function handleSaveAuto() {
    setSavingAuto(true)
    setAutoMsg('')
    try {
      await api.put('/superadmin/settings', {
        auto_update_enabled: String(autoUpdate),
        auto_update_interval_minutes: String(intervalMin),
      })
      setAutoMsg('Auto-update settings saved. This machine reacts to published releases instantly.')
    } catch (err: any) {
      setAutoMsg(err.response?.data?.message || 'Failed to save')
    } finally {
      setSavingAuto(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Remote Code Deployment</h2>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Event-driven: publish a release once — every online hospital pulls the new code within seconds (via the cloud
          release signal, checked on the existing 15&nbsp;s sync cycle) or within the check interval (cheap SHA comparison),
          whichever applies. No hospital-by-hospital visits.
        </p>

        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 mb-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Auto-update this machine</p>
              <p className="text-xs text-slate-400 mt-0.5">React to release signals instantly; also compare the remote SHA every {intervalMin} min (only pulls when something changed).</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-300 peer-checked:bg-emerald-500 rounded-full peer transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>
          <div className="flex flex-col md:flex-row gap-3 mt-4 items-start md:items-center">
            <label className="text-xs font-medium text-slate-600 flex-shrink-0">Check interval (minutes)</label>
            <input type="number" min={1} max={1440} value={intervalMin} onChange={(e) => setIntervalMin(parseInt(e.target.value, 10) || 1)}
              className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={handleSaveAuto} disabled={savingAuto}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
              {savingAuto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Settings2 className="w-3.5 h-3.5" />}
              {savingAuto ? 'Saving...' : 'Save Auto-Update Settings'}
            </button>
            {autoMsg && <span className={`text-xs font-medium ${autoMsg.includes('saved') ? 'text-emerald-600' : 'text-rose-600'}`}>{autoMsg}</span>}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white mb-5">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-700">Git Repository &amp; Security (read-only)</p>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Machines never push back. Configure a <strong>read-only</strong> fine-grained PAT or deploy key on this machine with
            <code className="px-1 py-0.5 rounded bg-slate-100 text-[10px] font-mono">scripts/hospital_git_setup.ps1</code> —
            credentials live in the Windows credential store, never in the URL or this page. Only the plain https URL goes here.
          </p>
          {gitConfig?.has_embedded_credentials && (
            <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span><strong>Warning:</strong> this machine's git remote URL embeds a secret. Run the setup script to move it into the OS credential store, then save the plain URL below.</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Repository URL (no token)</label>
              <input type="text" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)}
                placeholder="https://github.com/LuckyGoldx/sretan-hms.git"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Branch to follow</label>
              <input type="text" value={gitBranch} onChange={(e) => setGitBranch(e.target.value)}
                placeholder="master (default)"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={handleSaveGitConfig} disabled={gitSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
              {gitSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {gitSaving ? 'Saving...' : 'Save & Set Remote'}
            </button>
            <button onClick={handleVerifyGit} disabled={verifyLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 disabled:opacity-60 transition-all">
              {verifyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
              {verifyLoading ? 'Verifying...' : 'Verify Remote Access'}
            </button>
            {gitConfig?.origin_url && !gitUrl && (
              <span className="text-[11px] text-slate-400 font-mono">origin: {gitConfig.origin_url}</span>
            )}
          </div>
          {gitMsg && (
            <p className={`text-xs font-medium mt-2 flex items-center gap-1 ${gitMsgType === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
              <CheckCircle className="w-3.5 h-3.5" /> {gitMsg}
            </p>
          )}
          {verify && (
            <div className={`mt-3 p-3 rounded-xl text-xs border ${verify.reachable ? (verify.has_embedded_credentials ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                {verify.reachable
                  ? <><CheckCheck className="w-4 h-4" /> {verify.has_embedded_credentials ? 'Reachable but insecure' : 'Read-only remote verified'}</>
                  : <><ShieldAlert className="w-4 h-4" /> Remote not reachable</>}
              </div>
              <p className="leading-relaxed">{verify.message}</p>
              {verify.remote_sha && <p className="mt-1 font-mono">remote SHA: {verify.remote_sha.slice(0, 12)}… · branch {verify.branch}</p>}
              {verify.credential_helper && <p className="mt-1">credential store: {verify.credential_helper || 'none — use the setup script'}</p>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <button onClick={handlePublish} disabled={publishing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary-color)' }}>
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {publishing ? 'Publishing...' : 'Publish Update — push to all online hospitals'}
          </button>
          <button onClick={handleGitUpdate} disabled={updating}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {updating ? 'Pulling...' : 'Pull Latest Code (this machine)'}
          </button>
        </div>
        {publishMsg && (
          <p className={`text-sm font-medium mb-2 ${publishMsg.includes('published') || publishMsg.includes('seconds') ? 'text-emerald-600' : 'text-rose-600'}`}>{publishMsg}</p>
        )}
        {updateMsg && (
          <p className={`text-sm font-medium mb-2 ${updateMsg.includes('updated') ? 'text-emerald-600' : 'text-rose-600'}`}>{updateMsg}</p>
        )}
        {updateOutput && (
          <pre className="mb-4 bg-slate-900 text-emerald-300 text-[11px] leading-relaxed p-4 rounded-xl overflow-auto font-mono max-h-40 whitespace-pre-wrap break-all">
            {updateOutput}
          </pre>
        )}
      </div>

      {status && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Update Status</h2>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-400">cached — refreshes every 30 s (paused when this tab is hidden)</span>
              <button onClick={handleCheckNow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-all">
                <RefreshCw className="w-3.5 h-3.5" />
                Check Now
              </button>
            </div>
          </div>
          {status.checked_at && (
            <p className="text-[11px] text-slate-400 mb-3">Last checked: {new Date(status.checked_at).toLocaleTimeString()}</p>
          )}
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Last commit</dt><dd className="font-medium text-slate-700 font-mono text-xs pt-0.5">{status.last_commit || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Branch / Remote</dt><dd className="font-medium text-slate-700 font-mono text-xs pt-0.5">{status.branch || '—'} · {status.remote || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Remote change available</dt>
              <dd>{status.update_available
                ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">YES — pull to update</span>
                : <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Up to date</span>}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Cloud release signal</dt>
              <dd>{status.cloud_version
                ? <span className="font-mono text-[11px] text-slate-600 pt-0.5">{new Date(status.cloud_version).toLocaleString()}</span>
                : <span className="text-slate-400">none (Private Cloud uses git SHA)</span>}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Targeted release (this hospital)</dt>
              <dd>{status.tenant_release_pending
                ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold">Release sent — pull pending</span>
                : status.tenant_cloud_release
                  ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">Applied</span>
                  : <span className="text-slate-400">none</span>}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Applied commit (reported)</dt>
              <dd className="font-medium text-slate-700 font-mono text-xs pt-0.5">
                {status.local_sha ? status.local_sha.slice(0, 12) : '—'}
                {status.report?.last_pull_at && (
                  <span className="block text-[10px] text-slate-400 font-sans pt-1">
                    last pull {status.report.last_pull_ok ? 'OK' : 'FAILED'} · {new Date(status.report.last_pull_at).toLocaleString()}
                    {status.report.last_pull_ok === false && status.report.last_pull_error ? ` — ${String(status.report.last_pull_error).slice(0, 80)}` : ''}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between"><dt className="text-slate-500">Phoned home to cloud</dt>
              <dd>{status.report
                ? (status.report.last_phone_at
                    ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.report.last_phone_ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {status.report.last_phone_ok ? 'Reported' : 'Retrying'} · {new Date(status.report.last_phone_at).toLocaleTimeString()}
                      </span>
                    : <span className="text-slate-400">Pending first report</span>)
                : <span className="text-slate-400">No report yet</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {saasUrl && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Fleet Roll-out Status</h2>
            </div>
            <button onClick={() => navigate('/superadmin/fleet')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-all">
              <ArrowRight className="w-3.5 h-3.5" /> Open Full Fleet Monitor
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Every cloud-connected hospital host reports its applied commit through the shared Cloud SaaS project.
            <em> Cloud SaaS project only.</em>
          </p>
          {fleetMsg && !fleet && <p className="text-xs text-rose-600 mb-3">{fleetMsg}</p>}
          {fleet?.error && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">{fleet.error}</p>
          )}
          {fleet && fleet.summary && fleet.summary.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {([
                { label: 'Hospitals reporting', value: fleet.summary.distinct_hospitals, cls: 'text-slate-800' },
                { label: 'Up to date', value: fleet.summary.up_to_date, cls: 'text-emerald-600' },
                { label: 'Update pending', value: fleet.summary.update_pending, cls: 'text-amber-600' },
                { label: 'Pull failed', value: fleet.summary.pull_failed, cls: 'text-rose-600' },
                { label: 'Stale >24h', value: fleet.summary.stale, cls: 'text-slate-500' },
                { label: 'Auto-update off', value: fleet.summary.auto_update_off, cls: 'text-slate-500' },
              ]).map((s) => (
                <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className={`text-xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {fleet && fleet.summary && fleet.summary.total === 0 && (
            <p className="text-xs text-slate-400 py-3">No hospital has reported yet. Once a hospital runs the update daemon with cloud sync enabled it appears here within minutes.</p>
          )}
        </div>
      )}

      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50">
        <p className="text-sm font-semibold text-slate-700 mb-3">How it works now (event-driven, not periodic polling)</p>
        <ol className="space-y-2 text-xs text-slate-600">
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span>Push new code to the central Git repository, then click <strong>Publish Update</strong> (or for Private Cloud, just push — the git SHA check notices it).</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span>Each online hospital's sync cycle (every 15 s) reads the release signal and pulls the new code immediately.</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">3</span>The fallback SHA check runs every {intervalMin} min and only pulls when the remote actually changed.</li>
          <li className="flex gap-2"><span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">4</span>New migrations auto-apply on restart and the schema banner tells you to re-run the SQL in Supabase. <ArrowRight className="w-3.5 h-3.5 inline" /></li>
        </ol>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cloud Database Schema tab
// ---------------------------------------------------------------------------

function SchemaTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Cloud Database Schema</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Run this SQL in your Supabase SQL Editor to create the database schema the sync layer pushes data into.
          It is regenerated from the live migration files on every load, so it is always up to date.
        </p>
        <SchemaSqlViewer />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Setup Guide</h2>
        </div>
        <ol className="space-y-3 text-sm text-slate-600">
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
            <span>Create a Supabase project at <strong>supabase.com</strong> (free tier is enough to start).</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
            <span>Open <strong>SQL Editor</strong>, paste the schema SQL above (Copy SQL), and click <strong>Run</strong>.</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
            <span>Copy your project <strong>URL</strong> and <strong>anon key</strong> (Settings → API).</span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">4</span>
            <span>
              <strong>Cloud SaaS</strong>: paste them in the <strong>Deployment</strong> tab — every Cloud SaaS hospital syncs here.{' '}
              <strong>Private Cloud</strong>: paste them in that hospital's <strong>Settings → Deployment → Private Cloud</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">5</span>
            <span>Set the hospital's Deployment mode accordingly. The sync daemon runs every 15 seconds and stays offline-first — it only pushes when a cloud project is configured. <ArrowRight className="w-4 h-4 inline" /></span>
          </li>
        </ol>
      </div>
    </div>
  )
}
