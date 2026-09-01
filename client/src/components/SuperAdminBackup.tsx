import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database, Plus, Loader2, Trash2, Download, RefreshCw, Upload, AlertTriangle, CheckCircle, X, FileCode2, ArrowRight
} from 'lucide-react'
import api from '../hooks/superadminApi'
import SchemaSqlViewer from './SchemaSqlViewer'
import SchemaUpdateBanner from './SchemaUpdateBanner'

interface BackupEntry {
  name: string
  size: number
  modified_at: string
  manifest: {
    created_at?: string
    tables?: string[]
    migration_files?: string[]
    database?: string
    version?: string
  } | null
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function SuperAdminBackup() {
  const navigate = useNavigate()
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'restore' | 'delete'; name: string } | null>(null)
  const [busyAction, setBusyAction] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchBackups() {
    setLoading(true)
    try {
      const res = await api.get('/superadmin/backups')
      setBackups(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBackups() }, [])

  async function handleCreate() {
    setCreating(true)
    setMessage(null)
    try {
      const res = await api.post('/superadmin/backup')
      setMessage({ type: 'success', text: `Backup created: ${res.data.name} (${res.data.tables} tables)` })
      await fetchBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Backup failed' })
    } finally {
      setCreating(false)
    }
  }

  async function handleConfirm() {
    if (!confirmAction) return
    setBusyAction(true)
    setMessage(null)
    try {
      if (confirmAction.type === 'delete') {
        await api.delete(`/superadmin/backups/${confirmAction.name}`)
        setMessage({ type: 'success', text: 'Backup deleted' })
      } else {
        await api.post('/superadmin/restore', { name: confirmAction.name })
        setMessage({ type: 'success', text: 'Restore completed. The database and configuration were restored from this backup.' })
      }
      await fetchBackups()
      setConfirmAction(null)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || `${confirmAction.type === 'restore' ? 'Restore' : 'Delete'} failed` })
    } finally {
      setBusyAction(false)
    }
  }

  async function handleUploadRestore() {
    if (!restoreFile) return
    setUploading(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', restoreFile)
      const res = await api.post('/superadmin/restore', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setMessage({ type: 'success', text: 'Restore completed from uploaded backup' })
      setRestoreFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await fetchBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Restore failed' })
    } finally {
      setUploading(false)
    }
  }

  function handleDownload(name: string) {
    const token = localStorage.getItem('sretan_superadmin_token') || ''
    fetch(`/api/superadmin/backups/${name}/download`, { headers: { 'x-superadmin-token': token } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed')
        return res.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => setMessage({ type: 'error', text: 'Download failed' }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Backup &amp; Restore</h1>
          <p className="text-sm text-slate-500 mt-1">Full-database snapshots that automatically include every current and future table</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      {message && (
        <div className={`px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <CheckCircle className="w-4 h-4" />
          {message.text}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Restoring overwrites current data.</p>
          <p className="text-amber-700 mt-1">
            A restore drops the existing database objects and replaces them with the backup contents. Always create a fresh backup before restoring.
          </p>
        </div>
      </div>

      <SchemaUpdateBanner />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Schema Export</h2>
          </div>
          <button onClick={() => navigate('/superadmin/cloud')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-all">
            Cloud &amp; Sync setup <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          The complete SQL schema, regenerated from the live migration files on every load — always up to date, including any new tables.
          Run it in Supabase's SQL Editor to prepare the cloud database before enabling Private Cloud or Cloud SaaS.
        </p>
        <SchemaSqlViewer compact />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-semibold text-slate-800">Restore from uploaded backup file</h2>
        </div>
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sbackup"
            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 file:cursor-pointer cursor-pointer flex-1"
          />
          <button
            onClick={handleUploadRestore}
            disabled={!restoreFile || uploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {uploading ? 'Restoring...' : 'Upload & Restore'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
          <Database className="w-5 h-5 text-slate-600" />
          <h2 className="text-base font-semibold text-slate-800">Backup History ({backups.length})</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Database className="w-12 h-12 mb-3" />
            <p className="text-sm font-medium">No backups yet</p>
            <button onClick={handleCreate} disabled={creating}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create your first backup
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Backup</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium">Size</th>
                <th className="px-6 py-3 font-medium">Tables</th>
                <th className="px-6 py-3 font-medium">Migrations</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-800 font-mono text-xs break-all">{b.name}</p>
                    <p className="text-[11px] text-slate-400">{b.manifest?.database || 'sretan_emr'}</p>
                  </td>
                  <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(b.manifest?.created_at || b.modified_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-slate-500">{formatBytes(b.size)}</td>
                  <td className="px-6 py-3 text-slate-500">{b.manifest?.tables?.length ?? '?'}</td>
                  <td className="px-6 py-3 text-slate-500">{b.manifest?.migration_files?.length ?? '?'}</td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleDownload(b.name)} title="Download"
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmAction({ type: 'restore', name: b.name })} title="Restore"
                        className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmAction({ type: 'delete', name: b.name })} title="Delete"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmAction && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => { if (!busyAction) setConfirmAction(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-800">
                {confirmAction.type === 'restore' ? 'Restore Backup' : 'Delete Backup'}
              </h2>
              <button onClick={() => setConfirmAction(null)} className="p-1 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <div className={`flex items-center gap-3 mb-4 p-4 rounded-xl border ${
                confirmAction.type === 'restore' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
              }`}>
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${confirmAction.type === 'restore' ? 'text-amber-500' : 'text-rose-500'}`} />
                <p className={`text-sm ${confirmAction.type === 'restore' ? 'text-amber-800' : 'text-rose-700'}`}>
                  {confirmAction.type === 'restore' ? (
                    <>Restoring <strong className="break-all">{confirmAction.name}</strong> will overwrite the current database and configuration. This cannot be undone.</>
                  ) : (
                    <>Delete <strong className="break-all">{confirmAction.name}</strong>? This removes the backup file permanently.</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
              <button onClick={() => setConfirmAction(null)} disabled={busyAction}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={busyAction}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 disabled:opacity-60 ${
                  confirmAction.type === 'restore' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}>
                {busyAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {busyAction ? 'Working...' : confirmAction.type === 'restore' ? 'Restore Now' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
