import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface CollapsibleReasonProps {
  text?: string | null
  /** Maximum lines to show when collapsed (default 3). */
  clampLines?: number
  /** Characters at which the collapse toggle kicks in (default 180). */
  threshold?: number
  className?: string
}

/**
 * Renders a referral reason / free-text summary that clamps to a few lines
 * when long, with a "Show full reason / Show less" toggle. Keeps long reasons
 * from cluttering cards and modals.
 */
export default function CollapsibleReason({ text, clampLines = 3, threshold = 180, className = '' }: CollapsibleReasonProps) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const clamped = `line-clamp-${clampLines}` as 'line-clamp-3'
  return (
    <div className={className}>
      <p className={`text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words ${!expanded ? clamped : ''}`}>
        {text}
      </p>
      {text.length > threshold && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show full reason</>}
        </button>
      )}
    </div>
  )
}
