import { useState, useEffect } from 'react'
import {
  Cloud, Server, WifiOff, Save, Loader2, CheckCircle, Database, ShieldCheck, ArrowRight, GitBranch, RefreshCw
} from 'lucide-react'
import api from '../hooks/superadminApi'
import SchemaSqlViewer from './SchemaSqlViewer'
import SchemaUpdateBanner from './SchemaUpdateBanner'

export default function SuperAdminCloud() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateOutput, setUpdateOutput] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')

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

  async function handleGitUpdate() {
    setUpdating(true)
    setUpdateMsg('')
    setUpdateOutput('')
    try {
      const res = await api.post('/superadmin/git-update')
      setUpdateMsg(res.data.message || 'Repository updated')
      setUpdateOutput(res.data.output || '')
    } catch (err: any) {
      setUpdateMsg(err.response?.data?.message || 'Update failed')
      setUpdateOutput(err.response?.data?.output || '')
    } finally {
      setUpdating(false)
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all'

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
          These credentials are platform-wide and are used by any hospital whose Deployment mode is <strong>Cloud SaaS</strong>.
          Set up once here; individual hospitals do not need their own keys.
        </p>
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
                {showKey ? <EyeOffIcon /> : <EyeIcon />}
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
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Software Update (Remote Code)</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Pulls the latest code from this machine's configured <strong>Git remote</strong> (<code className="font-mono">git pull --ff-only</code>).
          Run this on each machine (or each offline hospital, when it is briefly online) after you push new code to your central repository,
          then restart the server to apply. Data is never modified — only code files.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleGitUpdate} disabled={updating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {updating ? 'Pulling...' : 'Pull Latest Code'}
          </button>
          {updateMsg && (
            <span className={`text-sm font-medium flex items-center gap-1 ${updateMsg.includes('updated') ? 'text-emerald-600' : 'text-rose-600'}`}>
              <CheckCircle className="w-4 h-4" />
              {updateMsg}
            </span>
          )}
        </div>
        {updateOutput && (
          <pre className="mt-3 bg-slate-900 text-emerald-300 text-[11px] leading-relaxed p-4 rounded-xl overflow-auto font-mono max-h-40 whitespace-pre-wrap break-all">
            {updateOutput}
          </pre>
        )}
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Recommended remote-push workflow for offline hospitals:</p>
          <p>1. Host a private Git repository (GitHub / Gitea) with this project.</p>
          <p>2. Each hospital's machine runs the app from a clone of that repo.</p>
          <p>3. Push new code there → open <strong>Cloud &amp; Sync → Pull Latest Code</strong> on each hospital (or a scheduled <code className="font-mono">git pull</code> script) → restart the server.</p>
          <p>4. New migrations are applied automatically on restart, and the schema notification tells you to re-run the SQL in Supabase.</p>
        </div>
      </div>

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
              <strong>Cloud SaaS</strong>: paste them above and save — every hospital in Cloud SaaS mode syncs here.{' '}
              <strong>Private Cloud</strong>: instead paste them in that hospital's <strong>Settings → Deployment → Private Cloud</strong>.
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

function EyeIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> }
function EyeOffIcon() { return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-2.157m5.18-1.743a3.5 3.5 0 114.74 4.74m4.976 4.16A10.05 10.05 0 0021.458 12c-1.274-4.057-5.064-7-9.542-7a10.05 10.05 0 00-1.875.175" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" /></svg> }
