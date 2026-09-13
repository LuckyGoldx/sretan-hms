import { useRef, useState } from 'react'
import { Mic, Square, X, Loader2 } from 'lucide-react'
import api from '../hooks/useAxios'

// Compact voice-note control: record from the microphone, upload, and attach
// the resulting audio URL to whatever field it is placed under.
export default function VoiceInput({ value, onChange }: { value?: string; onChange: (url: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  async function start() {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Microphone not supported'); return }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        setUploading(true)
        try {
          const fd = new FormData()
          fd.append('file', blob, 'voice-note.webm')
          const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          if (r.data?.path) onChange(r.data.path)
          else setError('Upload failed')
        } catch { setError('Upload failed') } finally { setUploading(false) }
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch { setError('Microphone unavailable') }
  }
  function stop() { try { recRef.current?.stop() } catch {} setRecording(false) }

  return (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      {!recording ? (
        <button type="button" onClick={start} disabled={uploading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-medium hover:bg-slate-50 disabled:opacity-50">
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />} {value ? 'Re-record' : 'Voice note'}
        </button>
      ) : (
        <button type="button" onClick={stop} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-medium">
          <Square size={11} /> Stop
        </button>
      )}
      {value && !recording && (
        <>
          <audio controls src={value} className="h-6 max-w-[180px]" />
          <button type="button" onClick={() => onChange('')} className="p-0.5 rounded text-slate-400 hover:text-rose-500"><X size={12} /></button>
        </>
      )}
      {error && <span className="text-[10px] text-rose-500">{error}</span>}
    </div>
  )
}
