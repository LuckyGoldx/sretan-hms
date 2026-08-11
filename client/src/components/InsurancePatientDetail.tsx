import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  Loader2, ArrowLeft, Shield, FileText, Beaker, Scan, Pill, Home, Stethoscope,
  Activity, Droplets, Baby, Plus, X, Trash2, DollarSign, ChevronDown,
  ChevronRight, FlaskConical, Clock, User, Calendar, Filter, CheckCircle, Eye
} from 'lucide-react'

const ALL_TYPES = 'all'

export default function InsurancePatientDetail() {
  const { patientId } = useParams()
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [services, setServices] = useState<any[]>([])
  const [selectedCase, setSelectedCase] = useState<string>('')
  const [activeTab, setActiveTab] = useState('main')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ service_type: 'consultation', service_name: '', quantity: 1, unit_price: '' })
  const [saving, setSaving] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceResult, setInvoiceResult] = useState<any>(null)
  const [servicesSubTab, setServicesSubTab] = useState<'pending' | 'invoiced'>('pending')
  const [viewInvoice, setViewInvoice] = useState<any | null>(null)
  const [viewInvoiceItems, setViewInvoiceItems] = useState<any[]>([])
  const [viewInvoiceLoading, setViewInvoiceLoading] = useState(false)

  // Session-only removal (X icon) — hidden for current billing, returns on refresh
  const [removedForBilling, setRemovedForBilling] = useState<Set<string>>(new Set())
  // Permanent delete (Trash icon) — 2-step confirmation
  const [confirmDeleteSvc, setConfirmDeleteSvc] = useState<any | null>(null)
  const [deleteStep, setDeleteStep] = useState(1)
  const [deletingSvc, setDeletingSvc] = useState(false)

  // Date filtering for Clinical Reference tab
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filteredSummary, setFilteredSummary] = useState<any>(null)

  // Collapsible sections in Clinical Reference tab
  const [sections, setSections] = useState<Record<string, boolean>>({
    labs: true, radiology: true, pharmacy: true, admissions: true,
    encounters: true, treatments: true, fluids: true,
  })

  useEffect(() => { if (patientId) loadData() }, [patientId])

  async function loadData() {
    setLoading(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/patient-summary/${patientId}`)
      setSummary(res.data)
      setFilteredSummary(res.data)
      const cases = res.data.insuranceCases || []
      if (cases.length > 0) {
        setSelectedCase(cases[0].id)
        await refreshServices(cases[0].id)
      }
    } catch {} finally { setLoading(false) }
  }

  async function refreshServices(caseId?: string) {
    const id = caseId || selectedCase
    if (!id) return
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/cases/${id}`)
      setServices(res.data.services || [])
    } catch {}
  }

  function applyDateFilter() {
    if (!summary) return
    const fs: any = { ...summary }
    const filterFn = (items: any[], dateField: string) => {
      if (!items) return []
      return items.filter((item: any) => {
        const d = new Date(item[dateField] || item.created_at)
        if (dateFilter === '1m') {
          const m = new Date(); m.setMonth(m.getMonth() - 1)
          return d >= m
        }
        if (dateFilter === '3m') {
          const m = new Date(); m.setMonth(m.getMonth() - 3)
          return d >= m
        }
        if (dateFilter === '6m') {
          const m = new Date(); m.setMonth(m.getMonth() - 6)
          return d >= m
        }
        if (dateFilter === '1y') {
          const y = new Date(); y.setFullYear(y.getFullYear() - 1)
          return d >= y
        }
        if (dateFilter === 'custom') {
          if (dateFrom && d < new Date(dateFrom)) return false
          if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
          return true
        }
        return true
      })
    }
    fs.labResults = filterFn(summary.labResults, 'created_at')
    fs.radiologyOrders = filterFn(summary.radiologyOrders, 'created_at')
    fs.prescriptions = filterFn(summary.prescriptions, 'created_at')
    fs.admissions = filterFn(summary.admissions, 'admitted_at')
    fs.encounters = filterFn(summary.encounters, 'created_at')
    fs.treatments = filterFn(summary.treatments, 'created_at')
    // Fluids use recorded_at from fluid_balance
    if (summary.fluidEntries) {
      fs.fluidEntries = filterFn(summary.fluidEntries, 'recorded_at')
    }
    setFilteredSummary(fs)
  }

  useEffect(() => { applyDateFilter() }, [dateFilter, dateFrom, dateTo, summary])

  async function addService() {
    if (!addForm.service_name || !selectedCase) return
    setSaving(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.post(`/insurance/cases/${selectedCase}/services`, {
        ...addForm,
        quantity: parseInt(addForm.quantity as any) || 1,
        unit_price: parseFloat(addForm.unit_price as any) || 0,
      })
      setShowAddModal(false)
      setAddForm({ service_type: 'consultation', service_name: '', quantity: 1, unit_price: '' })
      await refreshServices()
    } catch {} finally { setSaving(false) }
  }

  async function updateService(svcId: string, field: string, value: any) {
    try {
      const { default: api } = await import('../hooks/useAxios')
      const svc = services.find(s => s.id === svcId)
      if (!svc) return
      const updates: any = { quantity: svc.quantity, unit_price: svc.unit_price }
      if (field === 'quantity') updates.quantity = parseInt(value) || 0
      if (field === 'unit_price') updates.unit_price = parseFloat(value) || 0
      await api.put(`/insurance/cases/${selectedCase}/services/${svcId}`, updates)
      await refreshServices()
    } catch {}
  }

  // Temporary remove (X icon) — hides from current billing view, returns on refresh
  function removeForBilling(svcId: string) {
    setRemovedForBilling(prev => new Set(prev).add(svcId))
  }

  // Permanent delete executor (Trash icon) — hard deletes from DB, never returns
  async function executeDeleteService() {
    if (!confirmDeleteSvc) return
    setDeletingSvc(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.delete(`/insurance/cases/${selectedCase}/services/${confirmDeleteSvc.id}`)
      setServices(prev => prev.filter(s => s.id !== confirmDeleteSvc.id))
      setRemovedForBilling(prev => { const n = new Set(prev); n.delete(confirmDeleteSvc.id); return n })
      setConfirmDeleteSvc(null); setDeleteStep(1)
    } catch {}
    finally { setDeletingSvc(false) }
  }

  async function generateInvoice() {
    if (!selectedCase || pendingServices.length === 0) return
    if (!confirm(`Generate invoice for ${pendingServices.length} pending service(s) totaling ₦${pendingTotal.toLocaleString()}?`)) return
    setGeneratingInvoice(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const storedUser = localStorage.getItem('sretan_user')
      const userId = storedUser ? JSON.parse(storedUser).id : null
      const res = await api.post(`/insurance/cases/${selectedCase}/generate-invoice`, { generated_by: userId })
      setInvoiceResult(res.data)
      await refreshServices()
      // Refresh patient invoices in summary
      const sumRes = await api.get(`/insurance/patient-summary/${patientId}`)
      setSummary(sumRes.data)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to generate invoice')
    } finally { setGeneratingInvoice(false) }
  }

  async function openInvoiceDetail(inv: any) {
    setViewInvoice(inv)
    setViewInvoiceLoading(true)
    setViewInvoiceItems([])
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/invoices/${inv.id}`)
      setViewInvoiceItems(res.data.items || [])
    } catch { setViewInvoiceItems([]) }
    finally { setViewInvoiceLoading(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  if (!summary?.patient) return <div className="text-center py-12 text-slate-500">Patient not found</div>

  const p = summary.patient
  const cases = summary.insuranceCases || []
  const invoices = summary.invoices || []
  const fs = filteredSummary || summary

  const totalBilled = services.reduce((sum: number, s: any) => sum + parseFloat(s.total_price || 0), 0)
  const pendingServices = services.filter((s: any) => (s.status === 'pending' || !s.status) && !removedForBilling.has(s.id))
  const invoicedServices = services.filter((s: any) => s.status === 'invoiced')
  const pendingTotal = pendingServices.reduce((sum: number, s: any) => sum + parseFloat(s.total_price || 0), 0)
  const invoicedTotal = invoicedServices.reduce((sum: number, s: any) => sum + parseFloat(s.total_price || 0), 0)

  const tabs = [
    { key: 'main', label: 'Main', icon: Shield },
    { key: 'clinical', label: 'Clinical Reference', icon: FileText },
    { key: 'services', label: 'Insurance Services', icon: DollarSign },
    { key: 'invoices', label: 'Invoices', icon: FileText },
  ]

  // Reusable clinical reference sections
  function renderClinicalSections(data: any, showCounts: boolean = true) {
    if (!data) return null
    const serviceTypes = [
      { key: 'labs', label: 'Lab Results', icon: FlaskConical, items: data.labResults, color: 'text-amber-600', bg: 'bg-amber-50' },
      { key: 'radiology', label: 'Radiology', icon: Scan, items: data.radiologyOrders, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { key: 'pharmacy', label: 'Dispensed Drugs', icon: Pill, items: data.prescriptions, color: 'text-violet-600', bg: 'bg-violet-50' },
      { key: 'admissions', label: 'Admissions', icon: Home, items: data.admissions, color: 'text-blue-600', bg: 'bg-blue-50' },
      { key: 'encounters', label: 'Consultations', icon: Stethoscope, items: data.encounters, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { key: 'treatments', label: 'Treatments', icon: Activity, items: data.treatments, color: 'text-rose-600', bg: 'bg-rose-50' },
      { key: 'fluids', label: 'Fluid Therapy', icon: Droplets, items: data.fluidEntries || data.fluidSessions, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    ]
    return serviceTypes.map(({ key, label, icon: Icon, items, color, bg }) => (
      <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button onClick={() => setSections(prev => ({ ...prev, [key]: !prev[key] }))}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
            <span className="text-sm font-semibold text-slate-700">{label}</span>
            <span className="text-xs text-slate-400">({items?.length || 0})</span>
          </div>
          {sections[key] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </button>
        {sections[key] && (
          <div className="px-5 pb-4 space-y-1.5 max-h-80 overflow-y-auto">
            {(!items || items.length === 0) ? (
              <p className="text-xs text-slate-400 py-2">None recorded</p>
            ) : items.slice(0, showCounts ? 50 : 50).map((item: any, i: number) => (
              <div key={item.id || i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                {key === 'labs' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.test_name} — {item.analyte_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Value: <span className="font-mono font-medium">{item.value}</span>
                      {item.reference_range_low && ` (${item.reference_range_low}–${item.reference_range_high})`}
                      {item.is_abnormal && <span className="text-rose-500 ml-1">⚠</span>}
                    </p>
                  </div>
                )}
                {key === 'radiology' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.imaging_type}</p>
                    {item.report_text && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.report_text}</p>}
                  </div>
                )}
                {key === 'pharmacy' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.drug_name}</p>
                    <p className="text-xs text-slate-500">Qty: {item.quantity} &middot; {item.dosage || '—'}</p>
                  </div>
                )}
                {key === 'admissions' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.ward_name || 'Ward'}{item.bed_number ? ` (Bed ${item.bed_number})` : ''}</p>
                    <p className="text-xs text-slate-500">
                      {item.admitted_at?.slice(0, 10) || '—'} → {item.discharged_at?.slice(0, 10) || 'Ongoing'}
                      <span className={`ml-2 ${item.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>({item.status})</span>
                    </p>
                  </div>
                )}
                {key === 'encounters' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.encounter_type || 'Consultation'}</p>
                    <p className="text-xs text-slate-500">{item.doctor_name || 'Doctor'} &middot; {item.chief_complaint || '—'}</p>
                  </div>
                )}
                {key === 'treatments' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.treatment}</p>
                    <p className="text-xs text-slate-500">{item.dosage || ''} {item.route || ''} {item.frequency || ''}</p>
                  </div>
                )}
                {key === 'fluids' && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.fluid_type || 'Fluid'}</p>
                    <p className="text-xs text-slate-500">
                      {item.intake_ml ? `Intake: ${item.intake_ml}ml` : ''}
                      {item.route ? ` (${item.route})` : ''}
                    </p>
                    {item.notes && <p className="text-xs text-slate-400 mt-0.5">{item.notes}</p>}
                  </div>
                )}
                {['labs', 'radiology', 'pharmacy', 'encounters', 'fluids'].includes(key) && (
                  <span className="text-[10px] text-slate-400 flex-shrink-0">
                    {item.recorded_at ? new Date(item.recorded_at).toLocaleDateString() : item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                  </span>
                )}
              </div>
            ))}
            {items?.length > 50 && <p className="text-xs text-slate-400 pt-1">+{items.length - 50} more</p>}
          </div>
        )}
      </div>
    ))
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <a href="/insurance/patients" className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 truncate">{p.full_name}</h1>
            <p className="text-xs text-slate-500">{p.hospital_number} &middot; {p.sex} &middot; {p.dob?.slice(0, 10) || '—'}</p>
          </div>
        </div>
        {p.insurance_type && (
          <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">
            <Shield className="w-3.5 h-3.5" /> {p.insurance_type}{p.insurance && p.insurance !== '__other__' ? ` (${p.insurance})` : ''}
          </span>
        )}
      </div>

      {/* Case selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Insurance Case:</span>
          <select value={selectedCase} onChange={async e => {
            setSelectedCase(e.target.value)
            await refreshServices(e.target.value)
          }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
            <option value="">Select...</option>
            {cases.map((c: any) => (
              <option key={c.id} value={c.id}>{c.case_number} — {c.provider_name || 'Unknown'} ({c.status})</option>
            ))}
          </select>
        </div>
        {selectedCase && (
          <div className="text-sm text-slate-500">
            Total billed: <strong className="text-slate-800">₦{totalBilled.toLocaleString()}</strong>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
              activeTab === t.key ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Main — Two-panel layout */}
      {activeTab === 'main' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clinical Reference</h2>
            {renderClinicalSections(summary, false)}
          </div>
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Insurance Services</h2>
              {selectedCase && (
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>
            {!selectedCase ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                <Shield className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                Select a case
              </div>
            ) : services.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                No services yet
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {pendingServices.map((svc: any) => (
                    <div key={svc.id} className="p-3 hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700">{svc.service_name}</p>
                          <p className="text-[10px] text-slate-400">{svc.service_type}{svc.source_type ? ' • auto-synced' : ' • manual'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="w-16">
                          <input type="number" min={0} value={svc.quantity}
                            onChange={e => updateService(svc.id, 'quantity', e.target.value)}
                            className="w-full px-1.5 py-1 rounded-lg border border-slate-200 text-xs text-center" />
                        </div>
                        <span className="text-xs text-slate-400">×</span>
                        <div className="w-24">
                          <input type="number" min={0} value={svc.unit_price}
                            onChange={e => updateService(svc.id, 'unit_price', e.target.value)}
                            className="w-full px-1.5 py-1 rounded-lg border border-slate-200 text-xs text-right" />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-20 text-right">₦{(svc.quantity * svc.unit_price).toLocaleString()}</span>
                        <button onClick={() => removeForBilling(svc.id)} title="Remove for this billing (returns on refresh)"
                          className="p-1 text-slate-300 hover:text-amber-500 transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setConfirmDeleteSvc(svc); setDeleteStep(1) }} title="Delete permanently"
                          className="p-1 text-slate-300 hover:text-rose-500 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {pendingServices.length === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">No pending services. Invoiced items are in the Insurance Services tab.</div>
                  )}
                </div>
                <div className="border-t border-slate-200 p-3 bg-slate-50 space-y-1">
                  {invoicedTotal > 0 && (
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Invoiced</span><span>₦{invoicedTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Pending (billable)</span><span className="text-emerald-700">₦{pendingTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-bold text-slate-800 pt-1 border-t border-slate-100">
                    <span>Total</span><span>₦{totalBilled.toLocaleString()}</span>
                  </div>
                </div>
                <button onClick={generateInvoice} disabled={generatingInvoice || pendingServices.length === 0}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-all">
                  {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  {generatingInvoice ? 'Generating...' : `Generate Invoice (${pendingServices.length} pending)`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Clinical Reference (with date filter) */}
      {activeTab === 'clinical' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
              <option value="all">All time</option>
              <option value="1m">Last month</option>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="1y">Last year</option>
              <option value="custom">Custom range</option>
            </select>
            {dateFilter === 'custom' && (
              <>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm" />
              </>
            )}
            <span className="text-xs text-slate-400 ml-auto">
              Showing from {dateFilter === 'all' ? 'beginning' : dateFilter === 'custom' ? `${dateFrom || 'start'} to ${dateTo || 'now'}` : dateFilter}
            </span>
          </div>
          {renderClinicalSections(fs, true)}
        </div>
      )}

      {/* TAB: Insurance Services (full list) */}
      {activeTab === 'services' && (
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Billing Services for <span className="text-emerald-600">{cases.find((c: any) => c.id === selectedCase)?.case_number || '—'}</span></h2>
            {selectedCase && servicesSubTab === 'pending' && (
              <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                <Plus className="w-3.5 h-3.5" /> Add Service
              </button>
            )}
          </div>

          {!selectedCase ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              <Shield className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              Select an insurance case above to manage billing services
            </div>
          ) : (
            <>
              {/* Pending / Invoiced sub-tabs */}
              <div className="flex gap-1 border-b border-slate-200">
                <button onClick={() => setServicesSubTab('pending')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${servicesSubTab === 'pending' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  Pending ({pendingServices.length})
                </button>
                <button onClick={() => setServicesSubTab('invoiced')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${servicesSubTab === 'invoiced' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  Invoiced ({invoicedServices.length})
                </button>
              </div>

              {servicesSubTab === 'pending' ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Service</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Type</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Qty</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Price</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Total</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Source</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingServices.map((svc: any) => (
                        <tr key={svc.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 px-4">
                            <p className="text-xs font-medium">{svc.service_name}</p>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-500">{svc.service_type}</td>
                          <td className="py-2.5 px-4 text-center">
                            <input type="number" min={0} value={svc.quantity}
                              onChange={e => updateService(svc.id, 'quantity', e.target.value)}
                              className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs text-center" />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <input type="number" min={0} value={svc.unit_price}
                              onChange={e => updateService(svc.id, 'unit_price', e.target.value)}
                              className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs text-right" />
                          </td>
                          <td className="py-2.5 px-4 text-right text-xs font-bold">₦{(svc.quantity * svc.unit_price).toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${svc.source_type ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                              {svc.source_type ? 'auto' : 'manual'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => removeForBilling(svc.id)} title="Remove for this billing (returns on refresh)"
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-all">
                                <X className="w-4 h-4" />
                              </button>
                              <button onClick={() => { setConfirmDeleteSvc(svc); setDeleteStep(1) }} title="Delete permanently"
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {pendingServices.length === 0 && (
                        <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-xs">No pending services — everything has been invoiced.</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={4} className="py-3 px-4 text-right text-sm">Pending Total</td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-emerald-700">₦{pendingTotal.toLocaleString()}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Service</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Type</th>
                        <th className="text-center py-3 px-4 font-medium text-slate-600">Qty</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Price</th>
                        <th className="text-right py-3 px-4 font-medium text-slate-600">Total</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600">Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoicedServices.map((svc: any) => (
                        <tr key={svc.id} className="border-b border-slate-100 bg-slate-50/50">
                          <td className="py-2.5 px-4">
                            <p className="text-xs font-medium">{svc.service_name}</p>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-500">{svc.service_type}</td>
                          <td className="py-2.5 px-4 text-center text-xs">{svc.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-xs">₦{Number(svc.unit_price).toLocaleString()}</td>
                          <td className="py-2.5 px-4 text-right text-xs font-bold">₦{(svc.quantity * svc.unit_price).toLocaleString()}</td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 text-[10px] font-medium">
                              <FileText className="w-2.5 h-2.5" /> {svc.invoice_number || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {invoicedServices.length === 0 && (
                        <tr><td colSpan={6} className="py-10 text-center text-slate-400 text-xs">No invoiced items yet.</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={4} className="py-3 px-4 text-right text-sm">Invoiced Total</td>
                        <td className="py-3 px-4 text-right text-sm font-bold text-slate-700">₦{invoicedTotal.toLocaleString()}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
          {selectedCase && servicesSubTab === 'pending' && pendingServices.length > 0 && (
            <button onClick={generateInvoice} disabled={generatingInvoice || pendingServices.length === 0}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all">
              {generatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              {generatingInvoice ? 'Generating...' : `Generate Invoice (${pendingServices.length} pending)`}
            </button>
          )}
        </div>
      )}

      {/* TAB: Invoices */}
      {activeTab === 'invoices' && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Invoices for {p.full_name} ({invoices.length})</h2>
          </div>
          {invoices.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
              No invoices generated for this patient yet.
              {pendingServices.length > 0 && (
                <p className="mt-2">
                  <button onClick={generateInvoice} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700">
                    <DollarSign className="w-3.5 h-3.5" /> Generate Invoice for {pendingServices.length} pending services
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Invoice #</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Provider</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Period</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Amount</th>
                    <th className="text-right py-3 px-4 font-medium text-slate-600">Paid</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600">Status</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600">Date</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-xs font-bold">{inv.invoice_number}</td>
                      <td className="py-3 px-4">{inv.provider_name || '—'}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{inv.period_start} — {inv.period_end}</td>
                      <td className="py-3 px-4 text-right font-medium">₦{Number(inv.total_amount || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-emerald-600">₦{Number(inv.paid_amount || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'draft' ? 'bg-slate-100 text-slate-600' : inv.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-700'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => openInvoiceDetail(inv)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all">
                          <Eye className="w-3 h-3" /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Invoice Success Modal */}
      {invoiceResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setInvoiceResult(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-emerald-50">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Invoice Generated</h2>
                <p className="text-sm text-slate-500">{invoiceResult.invoice_number}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Provider</span>
                <span className="font-medium text-slate-700">{invoiceResult.provider_name || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Items</span>
                <span className="font-medium text-slate-700">{invoiceResult.items_count || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-slate-700">{invoiceResult.status}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="font-medium text-slate-700">Total</span>
                <span className="font-bold text-emerald-700">₦{Number(invoiceResult.total_amount || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setInvoiceResult(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setViewInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center"><FileText className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{viewInvoice.invoice_number}</h2>
                  <p className="text-xs text-slate-400">{viewInvoice.provider_name || '—'} · {new Date(viewInvoice.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${viewInvoice.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : viewInvoice.status === 'draft' ? 'bg-slate-100 text-slate-600' : viewInvoice.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-700'}`}>
                  {viewInvoice.status}
                </span>
              </div>
              <button onClick={() => setViewInvoice(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6">
              {viewInvoiceLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-[10px] text-slate-400 uppercase">Period</p><p className="text-sm font-medium text-slate-700">{viewInvoice.period_start} → {viewInvoice.period_end}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Due Date</p><p className="text-sm font-medium text-slate-700">{viewInvoice.due_date || '—'}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Claim Ref</p><p className="text-sm font-medium text-slate-700">{viewInvoice.claim_reference || '—'}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Created</p><p className="text-sm font-medium text-slate-700">{new Date(viewInvoice.created_at).toLocaleDateString()}</p></div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Items ({viewInvoiceItems.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Case</th>
                            <th className="text-left py-2 px-3 font-medium text-slate-600">Service</th>
                            <th className="text-center py-2 px-3 font-medium text-slate-600">Qty</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-600">Unit</th>
                            <th className="text-right py-2 px-3 font-medium text-slate-600">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewInvoiceItems.map((item: any) => (
                            <tr key={item.id} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-xs">{item.case_number || '—'}</td>
                              <td className="py-2 px-3 text-xs font-medium">{item.description}</td>
                              <td className="py-2 px-3 text-center text-xs">{item.quantity}</td>
                              <td className="py-2 px-3 text-right text-xs">₦{Number(item.unit_price).toLocaleString()}</td>
                              <td className="py-2 px-3 text-right text-xs font-medium">₦{Number(item.total_price).toLocaleString()}</td>
                            </tr>
                          ))}
                          {viewInvoiceItems.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No items</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Total billed</span><span className="font-medium text-slate-700">₦{Number(viewInvoice.total_amount || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Amount paid</span><span className="font-medium text-emerald-600">₦{Number(viewInvoice.paid_amount || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm pt-1 border-t border-slate-200"><span className="font-medium text-slate-700">Balance</span><span className="font-bold text-slate-800">₦{Math.max(0, Number(viewInvoice.total_amount || 0) - Number(viewInvoice.paid_amount || 0)).toLocaleString()}</span></div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => setViewInvoice(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Close</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Service</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select value={addForm.service_type} onChange={e => setAddForm(p => ({ ...p, service_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="consultation">Consultation</option>
                  <option value="lab">Lab</option>
                  <option value="radiology">Radiology</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="admission">Admission</option>
                  <option value="procedure">Procedure</option>
                  <option value="treatment">Treatment</option>
                  <option value="maternity">Maternity</option>
                  <option value="fluid">Fluid Therapy</option>
                  <option value="misc">Miscellaneous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input type="text" value={addForm.service_name} onChange={e => setAddForm(p => ({ ...p, service_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="e.g. Malaria Rapid Test" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Qty</label>
                  <input type="number" min={1} value={addForm.quantity} onChange={e => setAddForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price (₦)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={addForm.unit_price}
                    placeholder="0.00"
                    onChange={e => {
                      const val = e.target.value
                      // Only allow numbers and decimals
                      if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setAddForm(p => ({ ...p, unit_price: val }))
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={addService} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Service Confirmation Modal (2 steps) */}
      {confirmDeleteSvc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmDeleteSvc(null); setDeleteStep(1) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${deleteStep === 2 ? 'bg-red-50' : 'bg-rose-50'}`}>
                <Trash2 className={`w-7 h-7 ${deleteStep === 2 ? 'text-red-500' : 'text-rose-500'}`} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {deleteStep === 2 ? 'Are you absolutely sure?' : 'Delete Service Permanently'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmDeleteSvc.service_name}</p>
            </div>
            <div className="px-6 pb-4">
              <div className={`rounded-xl p-4 text-sm ${deleteStep === 2 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                {deleteStep === 1 ? (
                  <>
                    <p>You are about to <strong>permanently delete this service</strong> from the insurance case.</p>
                    <p className="text-xs mt-2 text-slate-500">This will remove it from the patient's invoice generation permanently — it will <strong>not</strong> return on refresh.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">This is irreversible.</p>
                    <p className="text-xs mt-2">The service will be <strong>permanently deleted</strong> and can never be included in future invoices.</p>
                    <p className="text-xs font-bold mt-3">Are you 100% sure you want to proceed?</p>
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setConfirmDeleteSvc(null); setDeleteStep(1) }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              {deleteStep === 1 ? (
                <button onClick={() => setDeleteStep(2)} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <Trash2 className="w-4 h-4" /> Yes, Continue
                </button>
              ) : (
                <button onClick={executeDeleteService} disabled={deletingSvc}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-all">
                  {deletingSvc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingSvc ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
