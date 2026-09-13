import { useState } from 'react'

// Shows the first `limit` characters with a "Read more" toggle to expand.
export default function ReadMore({ text, limit = 300, className = '' }: { text?: string | null; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const value = text || ''
  if (!value) return null
  const truncated = value.length > limit
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {expanded || !truncated ? value : value.slice(0, limit) + '… '}
      {truncated && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-primary font-medium ml-1 hover:underline">
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </p>
  )
}
