import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, Loader2, FileCode2 } from 'lucide-react'
import api from '../hooks/superadminApi'

interface SchemaStatus {
  local_version: string
  cloud_version: string
  has_new_schema: boolean
  new_migrations: string[]
  migration_count: number
}

export default function SchemaUpdateBanner({ compact }: { compact?: boolean }) {
  const [status, setStatus] = useState<SchemaStatus | null>(null)
  const [acking, setAcking] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get('/superadmin/schema-status')
      .then((res) => setStatus(res.data))
      .catch(() => {})
  }, [])

  async function handleAck() {
    setAcking(true)
    try {
      await api.post('/superadmin/schema-ack')
      setDone(true)
      setTimeout(() => setDone(false), 2500)
      const res = await api.get('/superadmin/schema-status')
      setStatus(res.data)
    } catch {} finally {
      setAcking(false)
    }
  }

  if (!status || !status.has_new_schema) return null

  const count = status.new_migrations.length || status.migration_count

  return (
    <div className={`rounded-2xl border border-amber-300 bg-amber-50 p-4 ${compact ? 'p-3' : ''}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">
            New database schema available — re-run the schema SQL in Supabase
          </p>
          <p className="text-xs text-amber-700 mt-1">
            {count > 1 || !status.new_migrations.length
              ? `The schema changed since the cloud was last updated (${status.local_version}).`
              : `New migration${count > 1 ? 's' : ''}: ${status.new_migrations.join(', ')}.`}{' '}
            Old and new data will automatically re-push to the cloud once the new schema is applied there.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={handleAck} disabled={acking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60 transition-all">
              {acking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {done ? 'Recorded!' : "I've run it in Supabase"}
            </button>
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700">
              <FileCode2 className="w-3.5 h-3.5" />
              Use Copy SQL in the Schema Export section below
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
