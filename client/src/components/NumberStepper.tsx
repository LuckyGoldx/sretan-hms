import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface NumberStepperProps {
  value: number | string
  onChange: (value: number) => void
  step?: number
  min?: number
  className?: string
  inputClass?: string
  placeholder?: string
}

// Strip trailing zeros and handle string values: "0.00"->"0", "500.00"->"500", "2.50"->"2.5", "100.75"->"100.75"
function formatValue(v: any): string {
  if (v === undefined || v === null) return ''
  const num = parseFloat(v)
  if (isNaN(num)) return ''
  return String(num)
}

export default function NumberStepper({ value, onChange, step = 1, min = 0, className = '', inputClass = '', placeholder = '' }: NumberStepperProps) {
  // Initialize with the value so the actual quantity/price shows as the default
  const [text, setText] = useState<string>(() => formatValue(value))
  const [focused, setFocused] = useState(false)
  const isTypingRef = useRef(false)

  // Sync from prop only when NOT focused and the value actually differs from what's shown,
  // so typing is never overwritten (e.g. by async refreshServices after updateService)
  useEffect(() => {
    if (focused) return
    const incoming = formatValue(value)
    const currentParsed = parseFloat(text)
    const incomingParsed = parseFloat(incoming)
    // Skip if text is empty (user cleared it) or already matches the incoming numeric value
    if (text === '' || (isNaN(currentParsed) && isNaN(incomingParsed)) || currentParsed === incomingParsed) {
      return
    }
    setText(incoming)
  }, [value, focused])

  function sanitize(input: string): string {
    // Numbers only (incl. fractions): allow digits and a single decimal point
    let cleaned = input.replace(/[^0-9.]/g, '')
    const firstDot = cleaned.indexOf('.')
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    }
    return cleaned
  }

  function handleChange(raw: string) {
    isTypingRef.current = true
    const cleaned = sanitize(raw)
    setText(cleaned)
    if (cleaned === '') {
      onChange(0)
      return
    }
    const num = parseFloat(cleaned)
    if (!isNaN(num)) onChange(num)
  }

  function handleBlur() {
    isTypingRef.current = false
    setFocused(false)
  }

  function stepValue(delta: number) {
    const current = text === '' ? 0 : parseFloat(text) || 0
    const next = Math.max(min, Math.round((current + delta * step) * 100) / 100)
    setText(formatValue(next))
    onChange(next)
  }

  return (
    <div className={`flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { setFocused(true); isTypingRef.current = true }}
        onBlur={handleBlur}
        className={`w-full min-w-0 px-1.5 py-1 text-xs text-right outline-none appearance-none bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClass}`}
      />
      <div className="flex flex-col border-l border-slate-200 flex-shrink-0">
        <button type="button" onClick={() => stepValue(1)} aria-label="Increase"
          className="px-1 py-0.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 leading-none">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button type="button" onClick={() => stepValue(-1)} aria-label="Decrease"
          className="px-1 py-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 leading-none border-t border-slate-100">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
