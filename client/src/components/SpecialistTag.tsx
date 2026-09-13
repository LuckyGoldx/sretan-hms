import { Stethoscope, Building2 } from 'lucide-react'

interface SpecialistTagProps {
  departmentName?: string | null
  size?: 'sm' | 'xs'
  doctorName?: string | null
  startedAt?: string | null
}

/**
 * Renders the indigo "SPECIALIST · {Department}" badge used across
 * consultations, pharmacy, lab, radiology histories, and patient chart.
 * Hovering shows the doctor the patient is in consultation with and when it
 * started (when that information is supplied).
 */
export default function SpecialistTag({ departmentName, size = 'xs', doctorName, startedAt }: SpecialistTagProps) {
  const text = size === 'xs' ? 'text-[10px]' : 'text-xs'
  const tip = [
    doctorName ? `In consultation with ${doctorName}` : null,
    startedAt ? `Started ${new Date(startedAt).toLocaleString()}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <span className="group relative inline-flex">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold ${text}`}>
        <Stethoscope size={10} className="flex-shrink-0" />
        SPECIALIST
        {departmentName ? (
          <span className="inline-flex items-center gap-0.5 font-semibold">
            · {departmentName}
            <Building2 size={9} className="opacity-60" />
          </span>
        ) : null}
      </span>
      {tip && (
        <span className="pointer-events-none absolute left-0 top-full mt-1 z-50 hidden group-hover:block whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-normal text-white shadow-lg">
          {tip}
        </span>
      )}
    </span>
  )
}
