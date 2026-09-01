import { useState, useEffect } from 'react'
import { Loader2, Copy, Check, Download } from 'lucide-react'
import api from '../hooks/superadminApi'

export default function SchemaSqlViewer({ compact }: { compact?: boolean }) {
  const [sql, setSql] = useState('')
  const [migrations, setMigrations] = useState(0)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get('/superadmin/schema-export', { params: { inline: '1' } })
      .then((res) => {
        setSql(res.data.sql || '')
        setMigrations(res.data.migration_files?.length || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  function download() {
    const token = localStorage.getItem('sretan_superadmin_token') || ''
    fetch('/api/superadmin/schema-export', { headers: { 'x-superadmin-token': token } })
      .then((r) => { if (!r.ok) throw new Error('Failed'); return r.blob() })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'sretan-emr-schema.sql'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => {})
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Building schema SQL…
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={copy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-all">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy SQL'}
        </button>
        <button onClick={download}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-all">
          <Download className="w-3.5 h-3.5" />
          Download .sql
        </button>
        <span className="text-[11px] text-slate-400">
          Always current — generated from {migrations} migration files ({Math.round(sql.length / 1024)} KB)
        </span>
      </div>
      <pre className={`bg-slate-900 text-emerald-300 text-[11px] leading-relaxed p-4 rounded-xl overflow-auto font-mono whitespace-pre-wrap break-all ${compact ? 'max-h-64' : 'max-h-96'}`}>
        {sql}
      </pre>
    </div>
  )
}
