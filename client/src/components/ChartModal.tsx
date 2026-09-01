import { useState, useEffect } from 'react'
import { X, FileText, Baby } from 'lucide-react'
import PatientChart from './PatientChart'
import MaternityPatientDetail from './MaternityPatientDetail'

interface ChartModalProps {
  patientId: string
  maternityId?: string | null
  initialSection?: string
  onClose: () => void
}

/**
 * Wide, responsive modal that opens a patient's chart without leaving the
 * consultation page. If a maternity record exists, offers a toggle between the
 * Maternity chart and the standard chart.
 */
export default function ChartModal({ patientId, maternityId, initialSection, onClose }: ChartModalProps) {
  const [view, setView] = useState<'standard' | 'maternity'>(maternityId ? 'maternity' : 'standard')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-6xl h-[94vh] sm:h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            {maternityId ? (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setView('maternity')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    view === 'maternity' ? 'bg-pink-500 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Baby className="w-3.5 h-3.5" /> Maternity Chart
                </button>
                <button
                  onClick={() => setView('standard')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    view === 'standard' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> Standard Chart
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <FileText className="w-4 h-4 text-primary" /> Patient Chart
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500" aria-label="Close chart">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable, everything inside the modal */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {view === 'maternity' && maternityId ? (
            <MaternityPatientDetail id={maternityId} hideBack />
          ) : (
            <PatientChart patientId={patientId} hideBack initialSection={initialSection} />
          )}
        </div>
      </div>
    </div>
  )
}
