import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'

// Voice-to-text dictation mic. Callers place it on the field's title row; it
// appends recognised speech to the field value.
export default function VoiceTextInput({ value, onChange, textareaId, title }: { value: string; onChange: (val: string) => void; textareaId?: string; title?: string }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const preSpeechValue = useRef('')
  const prevLen = useRef(0)
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (listening && value.length > prevLen.current && textareaId) {
      const el = document.getElementById(textareaId)
      if (el) el.scrollTop = el.scrollHeight
    }
    prevLen.current = value.length
  }, [value, listening, textareaId])

  function toggle() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    if (!SpeechRecognition) { alert('Voice input is not supported in your browser. Try Chrome.'); return }
    preSpeechValue.current = value
    const rec = new SpeechRecognition()
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true
    rec.onresult = (event: any) => {
      let t = ''
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      onChange(preSpeechValue.current + (preSpeechValue.current && t ? ' ' : '') + t)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  return (
    <button type="button" onClick={toggle} title={listening ? 'Stop dictation' : (title || 'Start voice input')}
      className={`p-1.5 rounded-lg transition-colors ${listening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
      <Mic size={14} />
    </button>
  )
}
