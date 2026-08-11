import React, { Suspense, lazy, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useTheme } from './hooks/useTheme'
import {
  LayoutDashboard,
  UserPlus,
  Stethoscope,
  Beaker,
  Pill,
  Scan,
  Receipt, Banknote,
  Users,
  Settings,
  Loader2,
  LogOut,
  Menu,
  X as XIcon,
  ClipboardList,
  Package,
  Clock,
  Truck,
  Activity,
  Home,
  Calendar,
  ShoppingCart,
  AlertTriangle,
  FileText,
  BarChart3,
  CheckCircle,
  FlaskConical,
  Building2,
  ChevronDown,
  Baby, Heart, Shield, TrendingUp,
} from 'lucide-react'

const Login = lazy(() => import('./components/Login'))
const PatientDashboard = lazy(() => import('./components/PatientDashboard'))
const PatientRegistration = lazy(() => import('./components/PatientRegistration'))
const TriageStation = lazy(() => import('./components/TriageStation'))
const DoctorConsultation = lazy(() => import('./components/DoctorConsultation'))
const MyPatients = lazy(() => import('./components/MyPatients'))
const DoctorPrescriptions = lazy(() => import('./components/DoctorPrescriptions'))
const PatientChart = lazy(() => import('./components/PatientChart'))
const DoctorVitals = lazy(() => import('./components/DoctorVitals'))
const AdmissionsPage = lazy(() => import('./components/AdmissionsPage'))
const WalkInSales = lazy(() => import('./components/WalkInSales'))
const LabInventory = lazy(() => import('./components/LabInventory'))
const DoctorResults = lazy(() => import('./components/DoctorResults'))
const DoctorLabResults = lazy(() => import('./components/DoctorLabResults'))
const LabLowStock = lazy(() => import('./components/LabLowStock'))
const AppointmentsPage = lazy(() => import('./components/AppointmentsPage'))
const LaboratoryWorkbench = lazy(() => import('./components/LaboratoryWorkbench'))
const LabDashboard = lazy(() => import('./components/LabDashboard'))
const LabWorklist = lazy(() => import('./components/LabWorklist'))
const LabResults = lazy(() => import('./components/LabResults'))
const LabHistory = lazy(() => import('./components/LabHistory'))
const LabOrders = lazy(() => import('./components/LabOrders'))
const LabCatalog = lazy(() => import('./components/LabCatalog'))
const LabReports = lazy(() => import('./components/LabReports'))
const PharmacyDashboard = lazy(() => import('./components/PharmacyDashboard'))
const Dispensing = lazy(() => import('./components/Dispensing'))
const InventoryManager = lazy(() => import('./components/InventoryManager'))
const InventoryManagement = lazy(() => import('./components/InventoryManagement'))
const RadiologyDashboard = lazy(() => import('./components/RadiologyDashboard'))
const RadiologyResults = lazy(() => import('./components/RadiologyResults'))
const RadiologyReview = lazy(() => import('./components/RadiologyReview'))
const RadiologyOrders = lazy(() => import('./components/RadiologyOrders'))
const RadiologyHistory = lazy(() => import('./components/RadiologyHistory'))
const RadiologyInventory = lazy(() => import('./components/RadiologyInventory'))
const ExpiryMonitor = lazy(() => import('./components/ExpiryMonitor'))
const PurchaseOrders = lazy(() => import('./components/PurchaseOrders'))
const DispensingHistory = lazy(() => import('./components/DispensingHistory'))
const RadiologyModule = lazy(() => import('./components/RadiologyModule'))
const PaypointCheckout = lazy(() => import('./components/PaypointCheckout'))
const FinanceHMO = lazy(() => import('./components/FinanceHMO'))
const StaffManagement = lazy(() => import('./components/StaffManagement'))
const SuperAdminPortal = lazy(() => import('./components/SuperAdminPortal'))
const SetupConsole = lazy(() => import('./components/SetupConsole'))
const FinanceDashboard = lazy(() => import('./components/FinanceDashboard'))
const LabExpiry = lazy(() => import('./components/LabExpiry'))
const RadiologyExpiry = lazy(() => import('./components/RadiologyExpiry'))
const ServiceInventory = lazy(() => import('./components/ServiceInventory'))
const PaypointDashboard = lazy(() => import('./components/PaypointDashboard'))
const PaypointPending = lazy(() => import('./components/PaypointPending'))
const PaypointPatients = lazy(() => import('./components/PaypointPatients'))
const FinancePatientBilling = lazy(() => import('./components/FinancePatientBilling'))
const FinancePaymentHistory = lazy(() => import('./components/FinancePaymentHistory'))
const BillingPage = lazy(() => import('./components/BillingPage'))
const MaternityDashboard = lazy(() => import('./components/MaternityDashboard'))
const MaternityPatientList = lazy(() => import('./components/MaternityPatientList'))
const MaternityPatientDetail = lazy(() => import('./components/MaternityPatientDetail'))
const MaternityANCWorklist = lazy(() => import('./components/MaternityANCWorklist'))
const MaternityLabourWard = lazy(() => import('./components/MaternityLabourWard'))
const MaternityPostnatalWard = lazy(() => import('./components/MaternityPostnatalWard'))
const MaternityBooking = lazy(() => import('./components/MaternityBooking'))
const MaternityLabourSummary = lazy(() => import('./components/MaternityLabourSummary'))
const InsuranceLogin = lazy(() => import('./components/InsuranceLogin'))
const InsuranceDashboard = lazy(() => import('./components/InsuranceDashboard'))
const InsuranceProviders = lazy(() => import('./components/InsuranceProviders'))
const InsuranceStaff = lazy(() => import('./components/InsuranceStaff'))
const InsuranceCases = lazy(() => import('./components/InsuranceCases'))
const InsuranceCaseDetail = lazy(() => import('./components/InsuranceCaseDetail'))
const InsuranceNewCase = lazy(() => import('./components/InsuranceNewCase'))
const InsuranceInvoices = lazy(() => import('./components/InsuranceInvoices'))
const InsurancePatients = lazy(() => import('./components/InsurancePatients'))
const InsurancePatientDetail = lazy(() => import('./components/InsurancePatientDetail'))
const InsuranceAuthRequests = lazy(() => import('./components/InsuranceAuthRequests'))
const InsuranceReports = lazy(() => import('./components/InsuranceReports'))
const InsuranceLayout = lazy(() => import('./components/InsuranceLayout'))

interface SidebarLink {
  to: string
  label: string
  icon: React.FC<{ className?: string }>
  roles: string[]
  category?: string
}

const sidebarLinks: SidebarLink[] = [
  // ── Dashboard ──
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Doctor', 'Nurse', 'Records', 'Pharmacist', 'Lab Scientist', 'Paypoint', 'Admin'], category: 'Dashboard' },
  // ── Clinical ──
  { to: '/patients/register', label: 'Register Patient', icon: UserPlus, roles: ['Records', 'Admin'], category: 'Clinical' },
  { to: '/triage', label: 'Triage', icon: Stethoscope, roles: ['Nurse', 'Admin'], category: 'Clinical' },
  { to: '/patients', label: 'Patients', icon: Users, roles: ['Doctor', 'Admin', 'Nurse', 'Pharmacist'], category: 'Clinical' },
  { to: '/my-prescriptions', label: 'Prescriptions', icon: Pill, roles: ['Doctor', 'Admin'], category: 'Clinical' },
  { to: '/vitals', label: 'Vitals', icon: Activity, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Clinical' },
  { to: '/consultation', label: 'Consultation', icon: Stethoscope, roles: ['Doctor', 'Admin'], category: 'Clinical' },
  { to: '/doctor/results', label: 'Results', icon: FileText, roles: ['Doctor'], category: 'Clinical' },
  { to: '/appointments', label: 'Appointments', icon: Calendar, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Clinical' },
  { to: '/admissions', label: 'Admissions', icon: Home, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Clinical' },
  // ── Laboratory ──
  { to: '/lab', label: 'Lab Dashboard', icon: Beaker, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/worklist', label: 'Worklist', icon: FileText, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/results', label: 'Results', icon: CheckCircle, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/history', label: 'History', icon: Clock, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/orders', label: 'Lab Orders', icon: ShoppingCart, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/catalog', label: 'Test Catalog', icon: FlaskConical, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab/reports', label: 'Lab Reports', icon: BarChart3, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab-inventory', label: 'Lab Inventory', icon: Package, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab-low-stock', label: 'Lab Low Stock', icon: AlertTriangle, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  { to: '/lab-expiry', label: 'Lab Expiry', icon: Clock, roles: ['Lab Scientist', 'Admin'], category: 'Laboratory' },
  // ── Pharmacy ──
  { to: '/pharmacy', label: 'Pharmacy Dashboard', icon: Pill, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/dispensing', label: 'Dispensing', icon: ClipboardList, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/walk-in-sales', label: 'Walk-in Sales', icon: ShoppingCart, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/pharmacy-inventory', label: 'Pharmacy Inventory', icon: Package, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/pharmacy-expiry', label: 'Expiry Monitor', icon: Clock, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: Truck, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  { to: '/dispensing-history', label: 'Dispensing History', icon: ClipboardList, roles: ['Pharmacist', 'Admin'], category: 'Pharmacy' },
  // ── Radiology ──
  { to: '/radiology', label: 'Radiology Dashboard', icon: Scan, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology/worklist', label: 'Worklist', icon: ClipboardList, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology/results', label: 'Results', icon: CheckCircle, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology/review', label: 'Review', icon: CheckCircle, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology/orders', label: 'Orders', icon: Clock, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology/history', label: 'History', icon: Clock, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology-inventory', label: 'Radiology Inventory', icon: Package, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  { to: '/radiology-expiry', label: 'Radiology Expiry', icon: Clock, roles: ['Admin', 'Radiology'], category: 'Radiology' },
  // ── Maternity ──
  { to: '/maternity', label: 'Maternity Dashboard', icon: Baby, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Maternity' },
  { to: '/maternity/booking', label: 'Book Pregnancy', icon: UserPlus, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Maternity' },
  { to: '/maternity/patients', label: 'Maternity Patients', icon: Users, roles: ['Doctor', 'Nurse', 'Records', 'Admin'], category: 'Maternity' },
  { to: '/maternity/anc', label: 'ANC Visits', icon: Calendar, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
  { to: '/maternity/labour', label: 'Labour & Delivery', icon: Stethoscope, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
  { to: '/maternity/labour-summary', label: 'Labour Summary', icon: ClipboardList, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
  { to: '/maternity/postnatal', label: 'Postnatal', icon: Heart, roles: ['Doctor', 'Nurse', 'Admin'], category: 'Maternity' },
  // ── Records ──
  { to: '/records/patients', label: 'Patient Records', icon: Users, roles: ['Records', 'Admin'], category: 'Records' },
  { to: '/records/requests', label: 'Record Requests', icon: FileText, roles: ['Records', 'Admin'], category: 'Records' },
  // ── Finance ──
  { to: '/finance/dashboard', label: 'Finance Dashboard', icon: Banknote, roles: ['Finance', 'Admin'], category: 'Finance' },
  { to: '/finance/billing', label: 'Patient Records', icon: FileText, roles: ['Finance', 'Admin'], category: 'Finance' },
  { to: '/finance/payment-history', label: 'Payment History', icon: Receipt, roles: ['Finance', 'Admin'], category: 'Finance' },
  { to: '/paypoint/pending', label: 'All Pending', icon: Clock, roles: ['Paypoint', 'Admin'], category: 'Finance' },
  { to: '/paypoint/patients', label: 'Pending Patients', icon: Users, roles: ['Paypoint', 'Admin'], category: 'Finance' },
  { to: '/paypoint/billing', label: 'Billing', icon: Receipt, roles: ['Paypoint', 'Admin'], category: 'Finance' },
  { to: '/paypoint/history', label: 'Payment History', icon: FileText, roles: ['Paypoint', 'Admin'], category: 'Finance' },
  { to: '/finance', label: 'Finance / HMO', icon: Banknote, roles: ['Admin'], category: 'Finance' },
  // ── Insurance ──
  { to: '/admin/insurance/dashboard', label: 'Insurance Dashboard', icon: Shield, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/cases', label: 'Cases', icon: FileText, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/auth-requests', label: 'Auth Requests', icon: AlertTriangle, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/reports', label: 'Reports', icon: TrendingUp, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/cases/new', label: 'New Case', icon: UserPlus, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/patients', label: 'Patients', icon: Users, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/invoices', label: 'Invoices', icon: Receipt, roles: ['Admin', 'Finance'], category: 'Insurance' },
  { to: '/admin/insurance/providers', label: 'Providers', icon: Building2, roles: ['Admin'], category: 'Insurance' },
  { to: '/admin/insurance/staff', label: 'Staff', icon: Users, roles: ['Admin'], category: 'Insurance' },
  // ── Administration ──
  { to: '/services-inventory', label: 'Services Inventory', icon: Building2, roles: ['Admin'], category: 'Administration' },
  { to: '/staff', label: 'Staff Management', icon: Users, roles: ['Admin'], category: 'Administration' },
  { to: '/superadmin', label: 'Super Admin', icon: Settings, roles: ['Admin'], category: 'Administration' },
  { to: '/setup', label: 'Setup', icon: Settings, roles: ['Admin'], category: 'Administration' },
]

function getRole(): string | null {
  try {
    const stored = localStorage.getItem('sretan_user')
    if (stored) {
      const user = JSON.parse(stored)
      if (user.user_type === 'insurance_staff') return 'InsuranceStaff'
      return user.role || null
    }
  } catch {}
  return null
}

function getStoredUser(): any {
  try {
    const stored = localStorage.getItem('sretan_user')
    if (stored) return JSON.parse(stored)
  } catch {}
  return null
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [pendingRxCount, setPendingRxCount] = useState(0)
  const [pendingLabCount, setPendingLabCount] = useState(0)
  const [completedLabCount, setCompletedLabCount] = useState(0)
  const [unreadLabCount, setUnreadLabCount] = useState(0)
  const [pendingLabOrdersCount, setPendingLabOrdersCount] = useState(0)
  const [pendingAllCount, setPendingAllCount] = useState(0)
  const [pendingPatientsCount, setPendingPatientsCount] = useState(0)
  const [pendingResultsCount, setPendingResultsCount] = useState(0)
  const [doctorUnreadResultsCount, setDoctorUnreadResultsCount] = useState(0)
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('sretan_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    const interval = setInterval(() => {
      const stored = localStorage.getItem('sretan_user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch {}
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    async function fetchCounts() {
      try {
        const staffId = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).id } catch {} return '' })()
        const [rxRes, labOrdRes, labResRes, unreadLabRes, pendingOrdRes, pendingAllRes, pendingPatsRes, pendingResultsRes, docRadUnreadRes] = await Promise.all([
          fetch('/api/prescriptions?status=pending', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          fetch('/api/lab-orders?status=ordered', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          fetch('/api/lab-results?status=completed', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          staffId ? fetch(`/api/lab-orders?status=completed&doctor_id=${staffId}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }) : null,
          fetch('/api/lab-orders?is_paid=false', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          fetch('/api/payments/all-pending-items', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          fetch('/api/payments/pending-summary', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          fetch('/api/lab-results?status=draft', { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }),
          staffId ? fetch(`/api/radiology-orders?status=completed&doctor_id=${staffId}`, { headers: { 'x-master-token': 'sretan-emr-master-token-2026' } }) : null,
        ])
        const rxData = await rxRes.json()
        const labOrdData = await labOrdRes.json()
        const labResData = await labResRes.json()
        setPendingRxCount(Array.isArray(rxData) ? rxData.length : 0)
        setPendingLabCount(Array.isArray(labOrdData) ? labOrdData.length : 0)
        setCompletedLabCount(Array.isArray(labResData) ? labResData.length : 0)
        var labUnreadCount = 0
        if (unreadLabRes) {
          const unreadLabData = await unreadLabRes.json()
          labUnreadCount = Array.isArray(unreadLabData) ? unreadLabData.filter((o: any) => !o.doctor_read_at).length : 0
          setUnreadLabCount(labUnreadCount)
        }
        const pendingOrdData = await pendingOrdRes.json()
        setPendingLabOrdersCount(Array.isArray(pendingOrdData) ? pendingOrdData.length : 0)
        const pendingAllData = await pendingAllRes.json()
        setPendingAllCount(Array.isArray(pendingAllData) ? pendingAllData.length : 0)
        const pendingPatsData = await pendingPatsRes.json()
        setPendingPatientsCount(Array.isArray(pendingPatsData) ? pendingPatsData.length : 0)
        const pendingResultsData = await pendingResultsRes.json()
        setPendingResultsCount(Array.isArray(pendingResultsData) ? pendingResultsData.filter((r: any) => r.status === 'draft').length : 0)
        if (docRadUnreadRes) {
          var docRadData = await docRadUnreadRes.json()
          var radUnread = Array.isArray(docRadData) ? docRadData.filter((o: any) => !o.doctor_read_at).length : 0
          var totalCompleted = labUnreadCount + radUnread
          // Subtract items already read via localStorage
          try {
            var readIds: string[] = JSON.parse(localStorage.getItem('doctor_read_results') || '[]')
            totalCompleted = Math.max(0, totalCompleted - readIds.length)
          } catch {}
          setDoctorUnreadResultsCount(totalCompleted)
        } else {
          setDoctorUnreadResultsCount(labUnreadCount)
        }
      } catch {}
    }
    fetchCounts()
    const id = setInterval(fetchCounts, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handleResultsRead(e: Event) {
      setDoctorUnreadResultsCount((prev: number) => Math.max(0, prev - 1))
    }
    window.addEventListener('doctorResultsRead', handleResultsRead as EventListener)
    return () => window.removeEventListener('doctorResultsRead', handleResultsRead as EventListener)
  }, [])

  function handleLogout() {
    localStorage.removeItem('sretan_token')
    localStorage.removeItem('sretan_user')
    setUser(null)
    window.location.href = '/'
  }

  const displayName = user?.name || 'User'
  const displayRole = user?.role || ''
  const role = user?.role || getRole()

  const allowedLinks = sidebarLinks.filter(
    (l) => !role || l.roles.includes(role)
  )

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 shadow-sm z-40 flex flex-col transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}>
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
            M
          </div>
          <span className="font-semibold text-slate-800 text-sm">Sretan HMS</span>
          <button onClick={onClose} className="ml-auto lg:hidden p-1 rounded-lg hover:bg-slate-100">
            <XIcon className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {role === 'Admin' ? (() => {
            const grouped: Record<string, SidebarLink[]> = {}
            for (const link of allowedLinks) {
              const cat = link.category || 'Other'
              if (!grouped[cat]) grouped[cat] = []
              grouped[cat].push(link)
            }
            const categoryOrder = ['Dashboard', 'Clinical', 'Laboratory', 'Pharmacy', 'Radiology', 'Maternity', 'Records', 'Finance', 'Insurance', 'Administration']
            const sorted = Object.entries(grouped).sort(([a], [b]) => {
              const ia = categoryOrder.indexOf(a)
              const ib = categoryOrder.indexOf(b)
              if (ia === -1 && ib === -1) return a.localeCompare(b)
              if (ia === -1) return 1
              if (ib === -1) return -1
              return ia - ib
            })
            function toggleCategory(cat: string) {
              setCollapsedCategories(prev =>
                prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
              )
            }
            return sorted.map(([category, links]) => (
              <div key={category} className="mb-1">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${collapsedCategories.includes(category) ? '-rotate-90' : ''}`} />
                  {category}
                </button>
                {!collapsedCategories.includes(category) && (
                  <div className="pl-2 space-y-1 mt-0.5">
                    {links.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={to === '/dashboard'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                            isActive
                              ? 'bg-blue-50 text-blue-600 shadow-sm'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {label}
                        {to === '/dispensing' && pendingRxCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{pendingRxCount}</span>
                        )}
                        {to === '/lab/orders' && pendingLabOrdersCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingLabOrdersCount}</span>
                        )}
                        {to === '/paypoint/pending' && pendingAllCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingAllCount}</span>
                        )}
                        {to === '/paypoint/patients' && pendingPatientsCount > 0 && (
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingPatientsCount}</span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))
          })() : (
            allowedLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
                {to === '/dispensing' && pendingRxCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">{pendingRxCount}</span>
                )}
                {to === '/lab/worklist' && role === 'Lab Scientist' && pendingLabCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingLabCount} new</span>
                )}
                {to === '/lab/orders' && pendingLabOrdersCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingLabOrdersCount}</span>
                )}
                {to === '/paypoint/pending' && pendingAllCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingAllCount}</span>
                )}
                {to === '/paypoint/patients' && pendingPatientsCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingPatientsCount}</span>
                )}
                {to === '/doctor/results' && role === 'Doctor' && doctorUnreadResultsCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{doctorUnreadResultsCount}</span>
                )}
                {to === '/lab/results' && role === 'Doctor' && unreadLabCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{unreadLabCount} unread</span>
                )}
                {to === '/lab/results' && role === 'Lab Scientist' && pendingResultsCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">{pendingResultsCount}</span>
                )}
              </NavLink>
            ))
          )}
        </nav>
        <div className="border-t border-slate-100 p-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xs">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{displayName}</p>
              {displayRole && <p className="text-xs text-slate-500">{displayRole}</p>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}

function LabRouter() {
  const role: string | null = (() => { try { const u = localStorage.getItem('sretan_user'); if (u) return JSON.parse(u).role } catch {} return null })()
  return (
    <Routes>
      <Route index element={<Suspense fallback={<LoadingFallback />}><LabDashboard /></Suspense>} />
      <Route path="worklist" element={<Suspense fallback={<LoadingFallback />}><LabWorklist /></Suspense>} />
      <Route path="results" element={<Suspense fallback={<LoadingFallback />}><LabResults /></Suspense>} />
      <Route path="history" element={<Suspense fallback={<LoadingFallback />}><LabHistory /></Suspense>} />
      <Route path="orders" element={<Suspense fallback={<LoadingFallback />}><LabOrders /></Suspense>} />
      <Route path="catalog" element={<Suspense fallback={<LoadingFallback />}><LabCatalog /></Suspense>} />
      <Route path="reports" element={<Suspense fallback={<LoadingFallback />}><LabReports /></Suspense>} />
      {role !== 'Doctor' && <Route path="legacy" element={<Suspense fallback={<LoadingFallback />}><LaboratoryWorkbench /></Suspense>} />}
    </Routes>
  )
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )
}


function DashboardRouter() {
  var role = getRole()
  if (role === 'Records') return <RecordsDashboard />
  if (role === 'Finance') return <Navigate to="/finance/dashboard" replace /> 
  if (role === 'Paypoint') return <Navigate to="/paypoint/dashboard" replace /> 
  return <PatientDashboard />
}

function HomeRedirect() {
  var role = getRole()
  if (!role) return <Navigate to="/login" replace />
  if (role === 'InsuranceStaff') return <Navigate to="/insurance/dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const role = getRole()
  if (!role) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="text-center">
          <p className="text-sm text-slate-500">Please log in first.</p>
          <a href="/login" className="text-sm text-blue-600 underline mt-2 inline-block">Go to Login</a>
        </div>
      </div>
    )
  }
  if (roles && !roles.includes(role)) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh] text-slate-400">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">Access Denied</p>
          <p className="text-xs mt-1">You do not have permission to view this page.</p>
          <a href="/dashboard" className="text-sm text-blue-600 underline mt-3 inline-block">Go to Dashboard</a>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

const RecordsDashboard = lazy(() => import('./components/RecordsDashboard'))
const RecordRequests = lazy(() => import('./components/RecordRequests'))
const DocumentManager = lazy(() => import('./components/DocumentManager'))
const RecordsPatientList = lazy(() => import('./components/RecordsPatientList'))
const RecordsPatientDetail = lazy(() => import('./components/RecordsPatientDetail'))
function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-20 lg:hidden p-2 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>
      <main className="flex-1 p-4 lg:ml-64 lg:p-6 pt-16 lg:pt-6 overflow-x-hidden">{children}</main>
    </div>
  )
}



export default function App() {
  useTheme()
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRedirect />} />
          <Route
            path="/dashboard"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Pharmacist', 'Lab Scientist', 'Paypoint', 'Admin', 'Finance']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DashboardRouter />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/patients/register"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <PatientRegistration />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/triage"
            element={
              <Layout>
                <ProtectedRoute roles={['Nurse', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <TriageStation />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/consultation"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DoctorConsultation />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/consultation/:patientId"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DoctorConsultation />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/doctor/results"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DoctorResults />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/patients"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin', 'Nurse', 'Records', 'Pharmacist', 'Paypoint']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <MyPatients />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/patient/:patientId"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin', 'Nurse']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <PatientChart />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/my-prescriptions"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DoctorPrescriptions />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/lab/*"
            element={
              <Layout>
                <ProtectedRoute roles={['Lab Scientist', 'Admin']}>
                  <LabRouter />
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/lab-inventory"
            element={
              <Layout>
                <ProtectedRoute roles={['Lab Scientist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <LabInventory />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/lab-low-stock"
            element={
              <Layout>
                <ProtectedRoute roles={['Lab Scientist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <LabLowStock />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/lab-expiry"
            element={
              <Layout>
                <ProtectedRoute roles={['Lab Scientist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <LabExpiry />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route path="/paypoint/pending" element={<Layout><ProtectedRoute roles={['Paypoint', 'Admin']}><Suspense fallback={<LoadingFallback />}><PaypointPending /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/paypoint/patients" element={<Layout><ProtectedRoute roles={['Paypoint', 'Admin']}><Suspense fallback={<LoadingFallback />}><PaypointPatients /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/paypoint/dashboard" element={<Layout><ProtectedRoute roles={['Paypoint', 'Admin']}><Suspense fallback={<LoadingFallback />}><PaypointDashboard /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/paypoint/billing" element={<Layout><ProtectedRoute roles={['Paypoint', 'Admin']}><Suspense fallback={<LoadingFallback />}><BillingPage /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/paypoint/history" element={<Layout><ProtectedRoute roles={['Paypoint', 'Admin']}><Suspense fallback={<LoadingFallback />}><PaypointCheckout /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology-inventory" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyInventory /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology-expiry" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyExpiry /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology/worklist" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyModule /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology/results" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyResults /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology/review" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyReview /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology/orders" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyOrders /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/radiology/history" element={<Layout><ProtectedRoute roles={['Admin', 'Radiology']}><Suspense fallback={<LoadingFallback />}><RadiologyHistory /></Suspense></ProtectedRoute></Layout>} />
                    <Route path="/maternity" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityDashboard /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/booking" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityBooking /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/patients" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityPatientList /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/patients/:id" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityPatientDetail /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/anc" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityANCWorklist /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/labour" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityLabourWard /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/labour-summary" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityLabourSummary /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/maternity/postnatal" element={<Layout><ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}><Suspense fallback={<LoadingFallback />}><MaternityPostnatalWard /></Suspense></ProtectedRoute></Layout>} />
          <Route
            path="/services-inventory" element={<Layout><ProtectedRoute roles={['Admin']}><Suspense fallback={<LoadingFallback />}><ServiceInventory /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/finance/dashboard" element={<Layout><ProtectedRoute roles={['Admin', 'Finance']}><Suspense fallback={<LoadingFallback />}><FinanceDashboard /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/finance/billing" element={<Layout><ProtectedRoute roles={['Admin', 'Finance']}><Suspense fallback={<LoadingFallback />}><FinancePatientBilling /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/finance/payment-history" element={<Layout><ProtectedRoute roles={['Admin', 'Finance']}><Suspense fallback={<LoadingFallback />}><FinancePaymentHistory /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/finance" element={<Layout><ProtectedRoute roles={['Admin', 'Finance']}><Suspense fallback={<LoadingFallback />}><Navigate to="/finance/dashboard" replace /></Suspense></ProtectedRoute></Layout>} />
          <Route path="/pharmacy"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <PharmacyDashboard />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/dispensing"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <Dispensing />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/walk-in-sales"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <WalkInSales />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/pharmacy-inventory"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <InventoryManagement />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/pharmacy-expiry"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <ExpiryMonitor />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/purchase-orders"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <PurchaseOrders />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/dispensing-history"
            element={
              <Layout>
                <ProtectedRoute roles={['Pharmacist', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DispensingHistory />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/radiology/*"
            element={
              <Layout>
                <ProtectedRoute roles={['Admin', 'Radiology']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <RadiologyDashboard />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/records"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <RecordsDashboard />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/records/requests"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <RecordRequests />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/records/patients/:patientId"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <RecordsPatientDetail />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/records/patients"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <RecordsPatientList />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/records/documents/:patientId"
            element={
              <Layout>
                <ProtectedRoute roles={['Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DocumentManager />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/appointments"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Nurse', 'Records', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <AppointmentsPage />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/vitals"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Admin', 'Nurse']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <DoctorVitals />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/admissions"
            element={
              <Layout>
                <ProtectedRoute roles={['Doctor', 'Nurse', 'Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <AdmissionsPage />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/staff"
            element={
              <Layout>
                <ProtectedRoute roles={['Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <StaffManagement />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route
            path="/superadmin"
            element={
              <Layout>
                <ProtectedRoute roles={['Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <SuperAdminPortal />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          {/* Admin Insurance Routes (within clinical Layout) */}
          <Route path="/admin/insurance/dashboard" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceDashboard /></Suspense></Layout>} />
          <Route path="/admin/insurance/cases" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceCases /></Suspense></Layout>} />
          <Route path="/admin/insurance/cases/new" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceNewCase /></Suspense></Layout>} />
          <Route path="/admin/insurance/cases/:id" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceCaseDetail /></Suspense></Layout>} />
          <Route path="/admin/insurance/invoices" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceInvoices /></Suspense></Layout>} />
          <Route path="/admin/insurance/providers" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceProviders /></Suspense></Layout>} />
          <Route path="/admin/insurance/staff" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceStaff /></Suspense></Layout>} />
          <Route path="/admin/insurance/patients" element={<Layout><Suspense fallback={<LoadingFallback />}><InsurancePatients /></Suspense></Layout>} />
          <Route path="/admin/insurance/patients/:patientId" element={<Layout><Suspense fallback={<LoadingFallback />}><InsurancePatientDetail /></Suspense></Layout>} />
          <Route path="/admin/insurance/auth-requests" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceAuthRequests /></Suspense></Layout>} />
          <Route path="/admin/insurance/reports" element={<Layout><Suspense fallback={<LoadingFallback />}><InsuranceReports /></Suspense></Layout>} />
          <Route
            path="/setup"
            element={
              <Layout>
                <ProtectedRoute roles={['Admin']}>
                  <Suspense fallback={<LoadingFallback />}>
                    <SetupConsole />
                  </Suspense>
                </ProtectedRoute>
              </Layout>
            }
          />
          <Route path="/insurance/login" element={<Suspense fallback={<LoadingFallback />}><InsuranceLogin /></Suspense>} />
          <Route path="/insurance/dashboard" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceDashboard /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/providers" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceProviders /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/staff" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceStaff /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/cases" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceCases /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/cases/new" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceNewCase /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/cases/:id" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceCaseDetail /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/invoices" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceInvoices /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/patients" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsurancePatients /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/patients/:patientId" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsurancePatientDetail /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/auth-requests" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceAuthRequests /></InsuranceLayout></Suspense>} />
          <Route path="/insurance/reports" element={<Suspense fallback={<LoadingFallback />}><InsuranceLayout><InsuranceReports /></InsuranceLayout></Suspense>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
