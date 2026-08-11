import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2, ArrowLeft, Plus, X, Edit3, Trash2, AlertTriangle, MinusCircle, CheckCircle } from 'lucide-react'

export default function InsuranceCaseDetail() {
  const { id } = useParams()
  const [caseData, setCaseData] = useState<any>(null)
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [showAddService, setShowAddService] = useState(false)
  const [serviceForm, setServiceForm] = useState({ service_type: 'consultation', service_name: '', quantity: 1, unit_price: 0, notes: '' })
  const [saving, setSaving] = useState(false)

  // Remove confirmation (1 step)
  const [confirmRemove, setConfirmRemove] = useState<any | null>(null)

  // Delete confirmation (3 steps)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [deleteStep, setDeleteStep] = useState(1)

  useEffect(() => { if (id) loadCase() }, [id])

  async function loadCase() {
    setLoading(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      const res = await api.get(`/insurance/cases/${id}`)
      setCaseData(res.data)
      setServices(res.data.services || [])
    } catch {} finally { setLoading(false) }
  }

  async function addService() {
    if (!serviceForm.service_name) return
    setSaving(true)
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.post(`/insurance/cases/${id}/services`, serviceForm)
      setShowAddService(false)
      setServiceForm({ service_type: 'consultation', service_name: '', quantity: 1, unit_price: 0, notes: '' })
      await loadCase()
    } catch {} finally { setSaving(false) }
  }

  async function executeRemove() {
    if (!confirmRemove) return
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.put(`/insurance/cases/${id}/services/${confirmRemove.id}/remove`)
      setConfirmRemove(null)
      await loadCase()
    } catch (err: any) { alert(err.response?.data?.message || 'Remove failed') }
  }

  async function executeDelete() {
    if (!confirmDelete) return
    try {
      const { default: api } = await import('../hooks/useAxios')
      await api.delete(`/insurance/cases/${id}/services/${confirmDelete.id}`)
      setConfirmDelete(null); setDeleteStep(1)
      await loadCase()
    } catch {}
  }

  const tabs = ['info', 'services', 'billing']
  const tabLabels: Record<string, string> = { info: 'Case Info', services: 'Services', billing: 'Billing Summary' }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  if (!caseData) return <div className="text-center py-12 text-slate-500">Case not found</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <a href="/insurance/cases" className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </a>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{caseData.case_number}</h1>
          <p className="text-sm text-slate-500">{caseData.patient_name} — {caseData.provider_name}</p>
        </div>
        <span className={`ml-auto inline-flex px-3 py-1 rounded-full text-xs font-medium ${caseData.status === 'active' ? 'bg-emerald-100 text-emerald-700' : caseData.status === 'closed' ? 'bg-slate-100 text-slate-600' : caseData.status === 'disputed' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'}`}>
          {caseData.status}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${activeTab === t ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Patient Details</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-slate-500">Name:</span> <span className="font-medium">{caseData.patient_name}</span></p>
              <p><span className="text-slate-500">Hospital #:</span> <span className="font-mono">{caseData.hospital_number}</span></p>
              <p><span className="text-slate-500">Insurance ID:</span> <span className="font-mono">{caseData.patient_insurance_id || '—'}</span></p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Case Details</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-slate-500">Case #:</span> <span className="font-mono font-medium">{caseData.case_number}</span></p>
              <p><span className="text-slate-500">Provider:</span> <span className="font-medium">{caseData.provider_name}</span></p>
              <p><span className="text-slate-500">Auth Code:</span> <span className="font-mono">{caseData.auth_code || '—'}</span></p>
              <p><span className="text-slate-500">Coverage:</span> {caseData.coverage_start_date ? `${caseData.coverage_start_date} — ${caseData.coverage_end_date || 'ongoing'}` : 'Not set'}</p>
              <p><span className="text-slate-500">Co-pay Amount:</span> ₦{Number(caseData.co_pay_amount || 0).toLocaleString()}</p>
            </div>
          </div>
          {caseData.notes && (
            <div className="md:col-span-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{caseData.notes}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'services' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Services ({services.length})</h3>
            <button onClick={() => setShowAddService(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-all">
              <Plus className="w-3.5 h-3.5" /> Add Service
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-medium text-slate-600">Type</th>
                <th className="text-left py-2 px-3 font-medium text-slate-600">Service</th>
                <th className="text-center py-2 px-3 font-medium text-slate-600">Qty</th>
                <th className="text-right py-2 px-3 font-medium text-slate-600">Unit Price</th>
                <th className="text-right py-2 px-3 font-medium text-slate-600">Total</th>
                <th className="text-center py-2 px-3 font-medium text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s: any) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 px-3 text-xs text-slate-500">{s.service_type}</td>
                  <td className="py-2 px-3 font-medium">{s.service_name}</td>
                  <td className="py-2 px-3 text-center">{s.quantity}</td>
                  <td className="py-2 px-3 text-right">₦{Number(s.unit_price).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-medium">₦{Number(s.total_price).toLocaleString()}</td>
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setConfirmRemove(s)} title="Remove from billing list"
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-all">
                        <MinusCircle className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setConfirmDelete(s); setDeleteStep(1) }} title="Delete permanently"
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {services.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">No services added yet</td></tr>}
            </tbody>
            <tfoot>
              <tr className="font-bold text-slate-800">
                <td colSpan={4} className="py-3 px-3 text-right">Total</td>
                <td className="py-3 px-3 text-right">₦{Number(caseData.total_billed || 0).toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-slate-400 mt-3 italic">Adding/editing services here does not affect clinical records. These are for HMO billing only.</p>
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Billing Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Billed</p>
              <p className="text-2xl font-bold text-slate-800">₦{Number(caseData.total_billed || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Paid</p>
              <p className="text-2xl font-bold text-emerald-600">₦{Number(caseData.total_paid || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-500">Co-pay Collected</p>
              <p className="text-2xl font-bold text-amber-600">₦{Number(caseData.co_pay_collected || 0).toLocaleString()}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">Invoice references will appear here once invoices are generated.</p>
        </div>
      )}

      {/* Add Service Modal */}
      {showAddService && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowAddService(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Service</h3>
              <button onClick={() => setShowAddService(false)} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Type</label>
                <select value={serviceForm.service_type} onChange={e => setServiceForm(p => ({ ...p, service_type: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                  <option value="consultation">Consultation</option>
                  <option value="lab">Lab</option>
                  <option value="radiology">Radiology</option>
                  <option value="pharmacy">Pharmacy</option>
                  <option value="admission">Admission</option>
                  <option value="procedure">Procedure</option>
                  <option value="misc">Miscellaneous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Name</label>
                <input type="text" value={serviceForm.service_name} onChange={e => setServiceForm(p => ({ ...p, service_name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="e.g. Malaria Rapid Test" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input type="number" min={1} value={serviceForm.quantity} onChange={e => setServiceForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit Price (₦)</label>
                  <input type="number" min={0} value={serviceForm.unit_price} onChange={e => setServiceForm(p => ({ ...p, unit_price: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <input type="text" value={serviceForm.notes} onChange={e => setServiceForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowAddService(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl">Cancel</button>
                <button onClick={addService} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Service Confirmation Modal (1 step) */}
      {confirmRemove && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmRemove(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                <MinusCircle className="w-7 h-7 text-amber-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Remove Service from Billing</h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmRemove.service_name}</p>
            </div>
            <div className="px-6 pb-4">
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                <p>This will <strong>remove the service from the billing list</strong>. It will no longer be invoiced to the HMO.</p>
                <p className="text-xs text-amber-600 mt-2">The record is kept for audit purposes but excluded from totals.</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              <button onClick={executeRemove}
                className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 transition-all">
                <MinusCircle className="w-4 h-4" /> Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Service Confirmation Modal (3 steps) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmDelete(null); setDeleteStep(1) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${deleteStep === 3 ? 'bg-red-50' : deleteStep === 2 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                <AlertTriangle className={`w-7 h-7 ${deleteStep === 3 ? 'text-red-500' : deleteStep === 2 ? 'text-rose-500' : 'text-slate-400'}`} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {deleteStep === 3 ? 'Final Confirmation' : deleteStep === 2 ? 'Are you absolutely sure?' : 'Delete Service'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmDelete.service_name}</p>
            </div>
            <div className="px-6 pb-4">
              <div className={`rounded-xl p-4 text-sm ${deleteStep === 3 ? 'bg-red-50 text-red-700' : deleteStep === 2 ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'}`}>
                {deleteStep === 1 && (
                  <p>You are about to <strong>permanently delete this service</strong> from the insurance case.</p>
                )}
                {deleteStep === 2 && (
                  <>
                    <p>This will permanently remove:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1 text-xs">
                      <li><strong>{confirmDelete.service_name}</strong> (₦{Number(confirmDelete.total_price || 0).toLocaleString()})</li>
                      <li>Its entry from the billing list and any totals</li>
                      <li>The audit reference (this cannot be recovered)</li>
                    </ul>
                  </>
                )}
                {deleteStep === 3 && (
                  <>
                    <p className="font-semibold">This is irreversible.</p>
                    <p className="text-xs mt-2">The service record will be <strong>permanently deleted</strong> and cannot be restored.</p>
                    <p className="text-xs font-bold mt-3">Are you 100% sure you want to proceed?</p>
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setConfirmDelete(null); setDeleteStep(1) }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              {deleteStep === 1 && (
                <button onClick={() => setDeleteStep(2)} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <Trash2 className="w-4 h-4" /> Continue
                </button>
              )}
              {deleteStep === 2 && (
                <button onClick={() => setDeleteStep(3)} className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <AlertTriangle className="w-4 h-4" /> Yes, Continue
                </button>
              )}
              {deleteStep === 3 && (
                <button onClick={executeDelete}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all">
                  <Trash2 className="w-4 h-4" /> Yes, Delete Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
