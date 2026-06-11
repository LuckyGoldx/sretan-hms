import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onChange: (val: string) => void
  options: string[]
  placeholder?: string
  className?: string
  defaultOpen?: boolean
}

export default function SearchableSelect({ value, onChange, options, placeholder = 'Search...', className = '', defaultOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input type="text" value={open ? search : value}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); if (!value) setSearch('') }}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-30 max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map((o) => (
              <button key={o} type="button" onClick={() => { onChange(o); setSearch(o); setOpen(false) }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-primary/5 transition-colors ${o === value ? 'bg-primary/10 text-primary font-medium' : 'text-slate-700'}`}>{o}</button>
            ))
          ) : (
            <button type="button" onClick={() => { onChange(search); setSearch(search); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-sm text-slate-400 italic hover:bg-primary/5">Use "{search}"</button>
          )}
        </div>
      )}
    </div>
  )
}
