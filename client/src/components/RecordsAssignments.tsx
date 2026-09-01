import { UserCheck } from 'lucide-react'
import AssignmentBoard from './AssignmentBoard'

export default function RecordsAssignments() {
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Patient Assignments</h1>
          <p className="text-sm text-slate-400">Assign patients to doctors, departments, and consultation fees</p>
        </div>
      </div>
      <AssignmentBoard embedded />
    </div>
  )
}
