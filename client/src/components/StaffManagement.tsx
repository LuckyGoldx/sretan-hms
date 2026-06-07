import { useState, useEffect, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Users,
  Calendar,
  AlertTriangle,
  UserPlus,
  IdCard,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  FlaskConical,
  Pill,
  Shield,
  FileText,
  Receipt,
  Loader2,
  X,
  Check
} from 'lucide-react'
import api from '../hooks/useAxios'

type StaffRole = 'Doctor' | 'Nurse' | 'Lab Scientist' | 'Pharmacist' | 'Records' | 'Paypoint' | 'Admin'

interface StaffMember {
  id: string
  name: string
  email: string
  role: StaffRole
  phone: string
  status: string
  licenseExpiry: string
}

interface LicenseAlert {
  name: string
  role: StaffRole
  daysUntilExpiry: number
}

interface RosterCell {
  staffId: string | null
  staffName: string
  role: StaffRole | null
}

type RosterData = Record<string, Record<string, RosterCell>>

const ROLES: StaffRole[] = ['Doctor', 'Nurse', 'Lab Scientist', 'Pharmacist', 'Records', 'Paypoint', 'Admin']
const SHIFTS = [
  { id: 'morning', label: 'Morning', hours: '6AM - 2PM', icon: Clock },
  { id: 'afternoon', label: 'Afternoon', hours: '2PM - 10PM', icon: Clock },
  { id: 'night', label: 'Night', hours: '10PM - 6AM', icon: Clock },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const ROLE_COLORS: Record<StaffRole, string> = {
  Doctor: 'bg-blue-100 text-blue-700 border-blue-200',
  Nurse: 'bg-green-100 text-green-700 border-green-200',
  'Lab Scientist': 'bg-orange-100 text-orange-700 border-orange-200',
  Pharmacist: 'bg-purple-100 text-purple-700 border-purple-200',
  Records: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Paypoint: 'bg-amber-100 text-amber-700 border-amber-200',
  Admin: 'bg-slate-100 text-slate-700 border-slate-200',
}

const ROLE_ICONS: Record<StaffRole, React.FC<{ className?: string }>> = {
  Doctor: Stethoscope,
  Nurse: Shield,
  'Lab Scientist': FlaskConical,
  Pharmacist: Pill,
  Records: FileText,
  Paypoint: Receipt,
  Admin: Users,
}

const INITIAL_LICENSE_ALERTS: LicenseAlert[] = [
  { name: 'Dr. Sarah Johnson', role: 'Doctor', daysUntilExpiry: 25 },
  { name: 'Nurse Michael Chen', role: 'Nurse', daysUntilExpiry: 50 },
  { name: 'Dr. James Wilson', role: 'Doctor', daysUntilExpiry: 15 },
]

function getWeekDates(refDate: Date): Date[] {
  const day = refDate.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(refDate)
  monday.setDate(refDate.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return DAYS.map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatWeekRange(dates: Date[]): string {
  if (dates.length === 0) return ''
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const start = dates[0].toLocaleDateString('en-US', opts)
  const end = dates[dates.length - 1].toLocaleDateString('en-US', { ...opts, year: 'numeric' })
  return `${start} - ${end}`
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getCellStyle(role: StaffRole | null): string {
  if (!role) return 'border-dashed border-slate-200 hover:border-blue-300'
  return ROLE_COLORS[role]
}

export default function StaffManagement() {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  const [roster, setRoster] = useState<RosterData>({})
  const [openRosterCell, setOpenRosterCell] = useState<string | null>(null)

  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    role: '' as StaffRole | '',
    phone: '',
    password: '',
  })
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof typeof newStaff, string>>>({})

  const weekDates = getWeekDates(currentWeekStart)

  useEffect(() => {
    fetchStaff()
  }, [])

  async function fetchStaff() {
    setLoading(true)
    try {
      const res = await api.get('/staff')
      const data = Array.isArray(res.data) ? res.data : []
      const mapped: StaffMember[] = data.map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: ROLES.includes(s.role) ? s.role : 'Admin',
        phone: s.phone || '',
        status: s.status || 'active',
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }))
      setStaffList(mapped)
    } catch {
      setStaffList(generateMockStaff())
    } finally {
      setLoading(false)
    }
  }

  function generateMockStaff(): StaffMember[] {
    return [
      { id: uuidv4(), name: 'Dr. Sarah Johnson', email: 'sarah.johnson@clinic.com', role: 'Doctor', phone: '+1 555-0101', status: 'active', licenseExpiry: new Date(Date.now() + 25 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Nurse Michael Chen', email: 'michael.chen@clinic.com', role: 'Nurse', phone: '+1 555-0102', status: 'active', licenseExpiry: new Date(Date.now() + 50 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Dr. James Wilson', email: 'james.wilson@clinic.com', role: 'Doctor', phone: '+1 555-0103', status: 'active', licenseExpiry: new Date(Date.now() + 15 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Nurse Emily Davis', email: 'emily.davis@clinic.com', role: 'Nurse', phone: '+1 555-0104', status: 'active', licenseExpiry: new Date(Date.now() + 180 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Lab Scientist Robert Kim', email: 'robert.kim@clinic.com', role: 'Lab Scientist', phone: '+1 555-0105', status: 'active', licenseExpiry: new Date(Date.now() + 90 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Pharmacist Lisa Park', email: 'lisa.park@clinic.com', role: 'Pharmacist', phone: '+1 555-0106', status: 'active', licenseExpiry: new Date(Date.now() + 200 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Records Officer Blessing', email: 'blessing@clinic.com', role: 'Records', phone: '+1 555-0107', status: 'active', licenseExpiry: new Date(Date.now() + 300 * 86400000).toISOString() },
      { id: uuidv4(), name: 'Paypoint Clerk Chidi', email: 'chidi@clinic.com', role: 'Paypoint', phone: '+1 555-0108', status: 'active', licenseExpiry: new Date(Date.now() + 45 * 86400000).toISOString() },
    ]
  }

  const filteredStaff = staffList.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const licenseAlerts: LicenseAlert[] = staffList
    .map((s) => {
      const expiry = new Date(s.licenseExpiry).getTime()
      const now = Date.now()
      const days = Math.ceil((expiry - now) / 86400000)
      return { name: s.name, role: s.role, daysUntilExpiry: days }
    })
    .filter((a) => a.daysUntilExpiry > 0 && a.daysUntilExpiry <= 60)
    .concat(
      INITIAL_LICENSE_ALERTS.filter(
        (alert) => !staffList.some((s) => s.name === alert.name)
      )
    )
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)

  const stats = {
    total: staffList.length,
    doctors: staffList.filter((s) => s.role === 'Doctor').length,
    nurses: staffList.filter((s) => s.role === 'Nurse').length,
    labTechs: staffList.filter((s) => s.role === 'Lab Scientist').length,
  }

  function navigateWeek(direction: -1 | 1) {
    setCurrentWeekStart((prev) => {
      const d = new Date(prev)
      d.setDate(d.getDate() + direction * 7)
      return d
    })
    setOpenRosterCell(null)
  }

  function getRosterCell(dayIdx: number, shiftIdx: number): RosterCell {
    const key = `${dayIdx}-${shiftIdx}`
    const dayDate = weekDates[dayIdx]
    const dateKey = formatDateKey(dayDate)
    return roster[dateKey]?.[shiftIdx.toString()] ?? { staffId: null, staffName: '', role: null }
  }

  function assignToCell(dayIdx: number, shiftIdx: number, staff: StaffMember) {
    const dayDate = weekDates[dayIdx]
    const dateKey = formatDateKey(dayDate)
    setRoster((prev) => ({
      ...prev,
      [dateKey]: {
        ...(prev[dateKey] ?? {}),
        [shiftIdx.toString()]: { staffId: staff.id, staffName: staff.name, role: staff.role },
      },
    }))
    setOpenRosterCell(null)
  }

  function removeFromCell(dayIdx: number, shiftIdx: number) {
    const dayDate = weekDates[dayIdx]
    const dateKey = formatDateKey(dayDate)
    setRoster((prev) => {
      const updated = { ...prev }
      if (updated[dateKey]) {
        const shifts = { ...updated[dateKey] }
        delete shifts[shiftIdx.toString()]
        updated[dateKey] = shifts
      }
      return updated
    })
    setOpenRosterCell(null)
  }

  function validateForm(): boolean {
    const errs: Partial<Record<keyof typeof newStaff, string>> = {}
    if (!newStaff.name.trim()) errs.name = 'Name is required'
    if (!newStaff.email.trim()) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(newStaff.email)) errs.email = 'Invalid email'
    if (!newStaff.role) errs.role = 'Role is required'
    if (!newStaff.phone.trim()) errs.phone = 'Phone is required'
    if (!newStaff.password.trim()) errs.password = 'Password is required'
    else if (newStaff.password.length < 4) errs.password = 'Password must be at least 4 characters'
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleAddStaff() {
    if (!validateForm()) return
    setSubmitting(true)
    try {
      const payload = {
        name: newStaff.name.trim(),
        email: newStaff.email.trim(),
        phone: newStaff.phone.trim(),
        role: newStaff.role,
        password: newStaff.password,
      }
      const res = await api.post('/staff', payload)
      const newMember: StaffMember = {
        id: res.data.id,
        name: res.data.name,
        email: res.data.email,
        role: res.data.role as StaffRole,
        phone: res.data.phone || '',
        status: 'active',
        licenseExpiry: new Date(Date.now() + 365 * 86400000).toISOString(),
      }
      setStaffList((prev) => [...prev, newMember])
      setAddSuccess(true)
      setTimeout(() => {
        setShowAddModal(false)
        setAddSuccess(false)
        setNewStaff({ name: '', email: '', role: '', phone: '', password: '' })
        setFormErrors({})
      }, 1200)
    } catch {
      setFormErrors({ name: 'Failed to add staff. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const closeModal = useCallback(() => {
    if (addSuccess) return
    setShowAddModal(false)
    setNewStaff({ name: '', email: '', role: '', phone: '', password: '' })
    setFormErrors({})
  }, [addSuccess])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Management</h1>
          <p className="text-sm text-slate-500 mt-1">HR & Personnel Administration</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
          style={{ backgroundColor: 'var(--primary-color)' }}
        >
          <UserPlus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Staff', value: stats.total, icon: Users, color: 'bg-blue-500' },
          { label: 'Doctors', value: stats.doctors, icon: Stethoscope, color: 'bg-emerald-500' },
          { label: 'Nurses', value: stats.nurses, icon: Shield, color: 'bg-violet-500' },
          { label: 'Lab Techs', value: stats.labTechs, icon: FlaskConical, color: 'bg-orange-500' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 transition-all duration-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.color} bg-opacity-15 flex items-center justify-center`}
                style={{ backgroundColor: `color-mix(in srgb, ${stat.color}, transparent 85%)` }}
              >
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* License Expiry Alerts */}
      {licenseAlerts.length > 0 && (
        <div
          className="rounded-2xl shadow-sm border overflow-hidden animate-[slideUp_0.3s_ease-out]"
          style={{
            borderColor: 'var(--primary-color)',
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
          }}
        >
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            }}
          >
            <AlertTriangle className="w-5 h-5 text-white" />
            <h3 className="font-semibold text-white">License Expiry Alerts</h3>
          </div>
          <div className="p-4 space-y-2">
            {licenseAlerts.map((alert) => {
              const isUrgent = alert.daysUntilExpiry < 30
              const isWarning = alert.daysUntilExpiry < 60
              return (
                <div
                  key={alert.name}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${
                    isUrgent
                      ? 'bg-rose-50 border-rose-200'
                      : isWarning
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isUrgent ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      <IdCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{alert.name}</p>
                      <p className="text-xs text-slate-500">{alert.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${isUrgent ? 'text-rose-600' : 'text-amber-600'}`}>
                      {alert.daysUntilExpiry} days
                    </p>
                    <p className="text-xs text-slate-500">until expiry</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Personnel Directory */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: 'var(--primary-color)' }} />
              <h2 className="text-lg font-semibold text-slate-800">Personnel Directory</h2>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--primary-color)' }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  {['Name', 'Role', 'Email', 'Phone', 'Status'].map((col) => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">
                      No staff members found
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const RoleIcon = ROLE_ICONS[staff.role]
                    return (
                      <tr
                        key={staff.id}
                        className="hover:bg-slate-50 transition-colors duration-150"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                              <RoleIcon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-800">{staff.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border ${
                            ROLE_COLORS[staff.role]
                          }`}>
                            <RoleIcon className="w-3 h-3" />
                            {staff.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{staff.email}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{staff.phone || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            staff.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              staff.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                            }`} />
                            {staff.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Duty Roster Grid */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: 'var(--primary-color)' }} />
              <h2 className="text-lg font-semibold text-slate-800">Duty Roster</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">{formatWeekRange(weekDates)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigateWeek(-1)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all duration-200"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigateWeek(1)}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all duration-200"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header Row - Days */}
            <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-1 mb-1">
              <div className="px-3 py-2" />
              {weekDates.map((d, i) => (
                <div
                  key={i}
                  className={`px-3 py-2 text-center rounded-xl ${
                    d.toDateString() === new Date().toDateString()
                      ? 'bg-blue-50'
                      : 'bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-500">{DAYS[i]}</p>
                  <p className={`text-lg font-bold ${
                    d.toDateString() === new Date().toDateString()
                      ? 'text-blue-600'
                      : 'text-slate-800'
                  }`}>
                    {d.getDate()}
                  </p>
                </div>
              ))}
            </div>

            {/* Shift Rows */}
            {SHIFTS.map((shift, shiftIdx) => {
              const ShiftIcon = shift.icon
              return (
                <div key={shift.id} className="grid grid-cols-[100px_repeat(7,1fr)] gap-1 mb-1">
                  <div className="px-3 py-2 flex flex-col items-center justify-center bg-slate-50 rounded-xl">
                    <ShiftIcon className="w-4 h-4 text-slate-500 mb-0.5" />
                    <p className="text-xs font-semibold text-slate-700 leading-tight text-center">
                      {shift.label}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight">{shift.hours}</p>
                  </div>
                  {DAYS.map((_, dayIdx) => {
                    const cell = getRosterCell(dayIdx, shiftIdx)
                    const cellKey = `${dayIdx}-${shiftIdx}`
                    const isOpen = openRosterCell === cellKey

                    return (
                      <div key={dayIdx} className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenRosterCell(isOpen ? null : cellKey)
                          }
                          className={`w-full h-full min-h-[72px] px-2 py-1.5 rounded-xl border-2 text-left transition-all duration-150 ${
                            getCellStyle(cell.role)
                          }`}
                        >
                          {cell.staffId ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium leading-tight line-clamp-2">
                                {cell.staffName}
                              </span>
                              <span className="text-[10px] opacity-70 mt-0.5">{cell.role}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </button>

                        {/* Dropdown */}
                        {isOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenRosterCell(null)}
                            />
                            <div className="absolute z-20 mt-1 w-56 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden animate-[fadeIn_0.15s_ease-out]">
                              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                                <p className="text-xs font-semibold text-slate-700">
                                  {DAYS[dayIdx]} - {shift.label}
                                </p>
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {staffList
                                  .filter((s) => !cell.staffId || s.id !== cell.staffId)
                                  .map((s) => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => assignToCell(dayIdx, shiftIdx, s)}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors duration-100 flex items-center gap-2"
                                    >
                                      <div className={`w-2 h-2 rounded-full ${
                                        s.role === 'Doctor' ? 'bg-blue-500' :
                                        s.role === 'Nurse' ? 'bg-green-500' :
                                        s.role === 'Lab Scientist' ? 'bg-orange-500' :
                                        s.role === 'Pharmacist' ? 'bg-purple-500' :
                                        'bg-slate-500'
                                      }`} />
                                      <span className="text-slate-700">{s.name}</span>
                                      <span className="text-xs text-slate-400 ml-auto">{s.role}</span>
                                    </button>
                                  ))}
                              </div>
                              {cell.staffId && (
                                <div className="border-t border-slate-100 p-1">
                                  <button
                                    type="button"
                                    onClick={() => removeFromCell(dayIdx, shiftIdx)}
                                    className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  >
                                    Remove assignment
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
          <span className="text-xs text-slate-500 font-medium">Legend:</span>
          {(Object.entries(ROLE_COLORS) as [StaffRole, string][]).map(([role, cls]) => {
            const RoleIcon = ROLE_ICONS[role]
            const bg = cls.split(' ')[0]
            const text = cls.split(' ')[1]
            return (
              <span key={role} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${bg} ${text}`}>
                <RoleIcon className="w-3 h-3" />
                {role}
              </span>
            )
          })}
        </div>
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg animate-[fadeIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" style={{ color: 'var(--primary-color)' }} />
                <h3 className="text-lg font-semibold text-slate-800">Add Staff Member</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addSuccess ? (
              <div className="px-6 py-12 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Staff Added Successfully</h3>
                <p className="text-sm text-slate-500 mt-1">The staff member has been registered.</p>
              </div>
            ) : (
              <>
                <div className="px-6 py-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      value={newStaff.name}
                      onChange={(e) => {
                        setNewStaff((p) => ({ ...p, name: e.target.value }))
                        setFormErrors((p) => ({ ...p, name: undefined }))
                      }}
                      placeholder="Enter full name"
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        formErrors.name ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.name && <p className="text-xs text-rose-500 mt-1">{formErrors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                    <input
                      type="email"
                      value={newStaff.email}
                      onChange={(e) => {
                        setNewStaff((p) => ({ ...p, email: e.target.value }))
                        setFormErrors((p) => ({ ...p, email: undefined }))
                      }}
                      placeholder="email@clinic.com"
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        formErrors.email ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.email && <p className="text-xs text-rose-500 mt-1">{formErrors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                    <select
                      value={newStaff.role}
                      onChange={(e) => {
                        setNewStaff((p) => ({ ...p, role: e.target.value as StaffRole }))
                        setFormErrors((p) => ({ ...p, role: undefined }))
                      }}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        formErrors.role ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                      }`}
                    >
                      <option value="">Select role</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {formErrors.role && <p className="text-xs text-rose-500 mt-1">{formErrors.role}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={newStaff.phone}
                      onChange={(e) => {
                        setNewStaff((p) => ({ ...p, phone: e.target.value }))
                        setFormErrors((p) => ({ ...p, phone: undefined }))
                      }}
                      placeholder="+1 555-0000"
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        formErrors.phone ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.phone && <p className="text-xs text-rose-500 mt-1">{formErrors.phone}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      value={newStaff.password}
                      onChange={(e) => {
                        setNewStaff((p) => ({ ...p, password: e.target.value }))
                        setFormErrors((p) => ({ ...p, password: undefined }))
                      }}
                      placeholder="Set login password"
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                        formErrors.password ? 'border-rose-300 bg-rose-50' : 'border-slate-200'
                      }`}
                    />
                    {formErrors.password && <p className="text-xs text-rose-500 mt-1">{formErrors.password}</p>}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddStaff}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
                    style={{ backgroundColor: 'var(--primary-color)' }}
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {submitting ? 'Adding...' : 'Add Staff'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
