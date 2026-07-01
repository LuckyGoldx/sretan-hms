import { useState } from 'react'
import { X, MessageSquareText } from 'lucide-react'

export default function DoctorComment({ comment }: { comment: string }) {
  const [showFull, setShowFull] = useState(false)
  if (!comment) return null

  const truncated = comment.length > 50 ? comment.slice(0, 50) : comment

  return (
    <>
      <div className="flex items-start gap-1.5 text-xs text-sky-700 bg-sky-50 rounded-lg px-2.5 py-1.5 mt-1.5">
        <MessageSquareText size={12} className="mt-0.5 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="font-medium">Dr: </span>
          {truncated}
          {comment.length > 50 && (
            <button onClick={() => setShowFull(true)}
              className="ml-1 text-sky-500 hover:text-sky-700 font-medium underline underline-offset-2 whitespace-nowrap">
              View more
            </button>
          )}
        </span>
      </div>

      {showFull && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowFull(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MessageSquareText size={16} className="text-sky-500" />
                <h3 className="text-sm font-semibold text-slate-800">Doctor's Comment</h3>
              </div>
              <button onClick={() => setShowFull(false)} className="p-1 rounded-lg hover:bg-slate-100">
                <X size={16} className="text-slate-400" />
              </button>
            </div>
            <div className="px-5 py-5">
              <div className="bg-sky-50 rounded-xl p-4 border border-sky-100 text-sm text-sky-800 whitespace-pre-wrap leading-relaxed">
                {comment}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowFull(false)}
                className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
