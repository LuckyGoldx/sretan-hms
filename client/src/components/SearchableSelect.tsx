import { useState, useRef, useEffect } from 'react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
}

/**
 * Searchable dropdown for plain string options (used by registration forms).
 * Click to open, type to filter; onChange receives the selected string.
 */
export default function SearchableSelect({ value, onChange, options, placeholder = 'Select...', disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        disabled={disabled}
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((o) => (
            <button key={o} type="button" onMouseDown={() => { onChange(o); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">{o}</button>
          ))}
          {filtered.length === 0 && <div className="px-4 py-2.5 text-sm text-slate-400">No options found</div>}
        </div>
      )}
    </div>
  )
}
