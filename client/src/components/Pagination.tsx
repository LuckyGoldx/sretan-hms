import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (n: number) => void
  totalItems?: number
  perPage?: number
}

/**
 * Stylish, compact pagination used by /consultant/patients, /referrals and /patients.
 * Renders Previous / numbered page buttons / Next, plus an item count when provided.
 */
export default function Pagination({ page, totalPages, onChange, totalItems, perPage = 25 }: PaginationProps) {
  if (totalPages <= 1 && !totalItems) return null

  const pages: number[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (page <= 3) {
    for (let i = 1; i <= maxVisible; i++) pages.push(i)
  } else if (page >= totalPages - 2) {
    for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) pages.push(i)
  } else {
    for (let i = page - 2; i <= page + 2; i++) pages.push(i)
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
      {totalItems !== undefined ? (
        <p className="text-xs text-slate-500 font-medium">
          Showing <span className="font-semibold text-slate-700">{totalItems === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, totalItems)}</span> of <span className="font-semibold text-slate-700">{totalItems}</span> records
        </p>
      ) : <span />}

      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
              p === page
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-primary border border-transparent hover:border-primary/40'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white hover:border-primary/40 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
