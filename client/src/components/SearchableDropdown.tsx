import { useState, useRef, useEffect } from 'react'
import { Check } from 'lucide-react'

export interface SearchableOption {
  id: string
  label: string
  sublabel?: string
}

interface Props {
  value: string
  options: SearchableOption[]
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: string
  onSelect: (id: string) => void
  disabled?: boolean
}

/**
 * Searchable dropdown for id-bearing options (e.g. doctors, departments).
 * Click to open, type to filter; selecting calls onSelect(id); '' clears.
 */
export default function SearchableDropdown({ value, options, placeholder = 'Search...', allowEmpty = true, emptyLabel = '— Any —', onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.id === value)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = options.filter((o) =>
    !q || o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
  )

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (selected ? selected.label : '')}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
          {allowEmpty && (
            <button type="button" onMouseDown={() => { onSelect(''); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors">{emptyLabel}</button>
          )}
          {filtered.map((o) => (
            <button key={o.id} type="button" onMouseDown={() => { onSelect(o.id); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors">
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.sublabel && <span className="block text-[11px] text-slate-400 truncate">{o.sublabel}</span>}
                </span>
                {o.id === value && <Check size={14} className="text-primary flex-shrink-0" />}
              </span>
            </button>
          ))}
          {filtered.length === 0 && <div className="px-4 py-2.5 text-sm text-slate-400">No options found</div>}
        </div>
      )}
    </div>
  )
}
