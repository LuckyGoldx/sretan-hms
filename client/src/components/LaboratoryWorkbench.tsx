import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useAxios'
import type { LabOrder, LabResult } from '../types'
import {
  Beaker,
  FlaskConical,
  CheckCircle,
  FileSearch,
  UserCheck,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle
} from 'lucide-react'

interface OrderWithPatient extends LabOrder {
  patient_name?: string
}

interface AnalyteEntry {
  analyte_name: string
  value: string
  reference_range_low: string
  reference_range_high: string
}

interface DraftResult {
  id: string
  lab_order_id: string
  analyte_name: string
  value: string
  reference_range_low: string
  reference_range_high: string
  is_abnormal: boolean
  status: string
  approved_by: string | null
}

function isAbnormal(value: string, low: string, high: string): boolean {
  const num = parseFloat(value)
  if (isNaN(num)) return false
  if (low && num < parseFloat(low)) return true
  if (high && num > parseFloat(high)) return true
  return false
}

export default function LaboratoryWorkbench() {
  const [orders, setOrders] = useState<OrderWithPatient[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderWithPatient | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'urgency' | 'created_at'>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [analytes, setAnalytes] = useState<AnalyteEntry[]>([
    { analyte_name: '', value: '', reference_range_low: '', reference_range_high: '' }
  ])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [draftResults, setDraftResults] = useState<DraftResult[]>([])
  const [draftsLoading, setDraftsLoading] = useState(false)

  const [supervisorName, setSupervisorName] = useState('')
  const [approveTarget, setApproveTarget] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const { data } = await api.get<OrderWithPatient[]>('/lab-orders')
      const withNames = await Promise.all(
        (data || []).map(async (order) => {
          try {
            const encResp = await api.get<{ patient_id: string }>(`/encounters/${order.encounter_id}`)
            const patientId = encResp.data.patient_id
            const patResp = await api.get<{ full_name: string }>(`/patients/${patientId}`)
            return { ...order, patient_name: patResp.data.full_name }
          } catch {
            return { ...order, patient_name: 'Unknown' }
          }
        })
      )
      setOrders(withNames)
    } catch (err: any) {
      setOrdersError(err.response?.data?.message || err.message || 'Failed to load lab orders')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true)
    try {
      const { data } = await api.get<LabResult[]>('/lab-results?status=draft')
      setDraftResults(
        (data || []).map((r) => ({
          ...r,
          approved_by: r.approved_by || null
        }))
      )
    } catch {
      setDraftResults([])
    } finally {
      setDraftsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchDrafts()
  }, [fetchOrders, fetchDrafts])

  const sortedOrders = [...orders].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortField === 'created_at') {
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir
    }
    const aUrgent = a.status === 'urgent' ? 1 : 0
    const bUrgent = b.status === 'urgent' ? 1 : 0
    return (aUrgent - bUrgent) * dir
  })

  function toggleSort(field: 'urgency' | 'created_at') {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'urgency' ? 'desc' : 'desc')
    }
  }

  function handleOrderClick(order: OrderWithPatient) {
    setSelectedOrder(order)
    setExpandedOrderId((prev) => (prev === order.id ? null : order.id))
    setAnalytes([{ analyte_name: '', value: '', reference_range_low: '', reference_range_high: '' }])
    setSubmitError(null)
  }

  function addAnalyteRow() {
    setAnalytes((prev) => [
      ...prev,
      { analyte_name: '', value: '', reference_range_low: '', reference_range_high: '' }
    ])
  }

  function removeAnalyteRow(index: number) {
    setAnalytes((prev) => prev.filter((_, i) => i !== index))
  }

  function updateAnalyte(index: number, field: keyof AnalyteEntry, val: string) {
    setAnalytes((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: val } : a)))
  }

  async function handleSubmitResults() {
    if (!selectedOrder) return
    const valid = analytes.filter((a) => a.analyte_name.trim() && a.value.trim())
    if (valid.length === 0) {
      setSubmitError('Add at least one analyte with a name and value')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      for (const analyte of valid) {
        const abnormal = isAbnormal(analyte.value, analyte.reference_range_low, analyte.reference_range_high)
        await api.post('/lab-results', {
          lab_order_id: selectedOrder.id,
          analyte_name: analyte.analyte_name,
          value: analyte.value,
          reference_range_low: analyte.reference_range_low || null,
          reference_range_high: analyte.reference_range_high || null,
          is_abnormal: abnormal,
          status: 'draft'
        })
      }
      setAnalytes([{ analyte_name: '', value: '', reference_range_low: '', reference_range_high: '' }])
      setSelectedOrder(null)
      setExpandedOrderId(null)
      fetchDrafts()
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || err.message || 'Failed to submit results')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleApprove(labResultId: string) {
    if (!supervisorName.trim()) return
    setApproving(true)
    try {
      await api.put(`/lab-results/${labResultId}/approve`, {
        approved_by: supervisorName.trim()
      })
      setDraftResults((prev) =>
        prev.map((r) =>
          r.id === labResultId
            ? { ...r, status: 'completed', approved_by: supervisorName.trim() }
            : r
        )
      )
      setApproveTarget(null)
      setSupervisorName('')
    } catch {
      // silently fail
    } finally {
      setApproving(false)
    }
  }

  function statusBadge(status: string) {
    if (status === 'completed' || status === 'approved')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <CheckCircle size={12} /> Completed
        </span>
      )
    if (status === 'draft')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
          Draft
        </span>
      )
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
        {status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <FlaskConical size={22} className="text-[var(--primary-color)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Laboratory Workbench</h1>
            <p className="text-sm text-slate-500">Manage lab orders, enter analytes, and approve results</p>
          </div>
        </div>
        <button
          onClick={() => { fetchOrders(); fetchDrafts() }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform hover:shadow-sm"
        >
          <Loader2 size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Worklist Queue */}
        <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSearch size={18} className="text-[var(--primary-color)]" />
              <h2 className="font-semibold text-slate-800">Worklist Queue</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => toggleSort('urgency')}
                className={`px-2 py-1 rounded-lg border transition-colors ${
                  sortField === 'urgency' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                Urgency {sortField === 'urgency' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </button>
              <button
                onClick={() => toggleSort('created_at')}
                className={`px-2 py-1 rounded-lg border transition-colors ${
                  sortField === 'created_at' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                Date {sortField === 'created_at' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </button>
            </div>
          </div>

          {ordersLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Loading orders...
            </div>
          ) : ordersError ? (
            <div className="flex items-center justify-center py-16 text-rose-500 gap-2">
              <AlertCircle size={20} /> {ordersError}
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Beaker size={40} className="mb-2" />
              <p className="text-sm">No lab orders yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedOrders.map((order) => (
                <div key={order.id}>
                  <button
                    onClick={() => handleOrderClick(order)}
                    className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left ${
                      expandedOrderId === order.id ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex-shrink-0">
                        {expandedOrderId === order.id ? (
                          <ChevronUp size={16} className="text-[var(--primary-color)]" />
                        ) : (
                          <ChevronDown size={16} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{order.test_name}</p>
                        <p className="text-xs text-slate-500">
                          {order.patient_name || 'Unknown'} &middot; {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {statusBadge(order.status)}
                  </button>

                  {expandedOrderId === order.id && selectedOrder?.id === order.id && (
                    <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-100 space-y-4">
                      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Beaker size={16} /> Analyte Entry
                      </h3>

                      {analytes.map((analyte, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border transition-colors ${
                            analyte.value && isAbnormal(analyte.value, analyte.reference_range_low, analyte.reference_range_high)
                              ? 'bg-rose-50 border-rose-500'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Analyte Name</label>
                                <input
                                  type="text"
                                  value={analyte.analyte_name}
                                  onChange={(e) => updateAnalyte(idx, 'analyte_name', e.target.value)}
                                  placeholder="e.g. Hemoglobin"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
                                <input
                                  type="text"
                                  value={analyte.value}
                                  onChange={(e) => updateAnalyte(idx, 'value', e.target.value)}
                                  placeholder="e.g. 14.5"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Range Low</label>
                                <input
                                  type="text"
                                  value={analyte.reference_range_low}
                                  onChange={(e) => updateAnalyte(idx, 'reference_range_low', e.target.value)}
                                  placeholder="e.g. 12.0"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Range High</label>
                                <input
                                  type="text"
                                  value={analyte.reference_range_high}
                                  onChange={(e) => updateAnalyte(idx, 'reference_range_high', e.target.value)}
                                  placeholder="e.g. 16.0"
                                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                              </div>
                            </div>
                            {analytes.length > 1 && (
                              <button
                                onClick={() => removeAnalyteRow(idx)}
                                className="text-rose-400 hover:text-rose-600 p-1 mt-5"
                                title="Remove analyte"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                          {analyte.value && isAbnormal(analyte.value, analyte.reference_range_low, analyte.reference_range_high) && (
                            <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1">
                              <AlertCircle size={12} /> Value exceeds reference range
                            </p>
                          )}
                        </div>
                      ))}

                      <div className="flex items-center justify-between">
                        <button
                          onClick={addAnalyteRow}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 hover:scale-[1.01] active:scale-[0.99] transition-transform"
                        >
                          <Plus size={14} /> Add Analyte
                        </button>
                        <button
                          onClick={handleSubmitResults}
                          disabled={submitting}
                          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--primary-color)] text-white text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50"
                        >
                          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
                          Submit Results
                        </button>
                      </div>
                      {submitError && (
                        <p className="text-xs text-rose-600 flex items-center gap-1">
                          <AlertCircle size={12} /> {submitError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supervisor Gate */}
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <UserCheck size={18} className="text-[var(--primary-color)]" />
            <h2 className="font-semibold text-slate-800">Supervisor Gate</h2>
          </div>

          {draftsLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : draftResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <CheckCircle size={40} className="mb-2" />
              <p className="text-sm">No draft results pending</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {draftResults.map((result) => (
                <div key={result.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-800">{result.analyte_name}</span>
                    {statusBadge(result.status)}
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    Value: <span className="font-mono font-medium text-slate-700">{result.value}</span>
                    {result.reference_range_low && result.reference_range_high && (
                      <> (Range: {result.reference_range_low}–{result.reference_range_high})</>
                    )}
                  </p>
                  {result.status === 'draft' && (
                    <div>
                      {approveTarget === result.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={supervisorName}
                            onChange={(e) => setSupervisorName(e.target.value)}
                            placeholder="Supervisor name"
                            className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                          <button
                            onClick={() => handleApprove(result.id)}
                            disabled={approving || !supervisorName.trim()}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50"
                          >
                            {approving ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
                          </button>
                          <button
                            onClick={() => { setApproveTarget(null); setSupervisorName('') }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setApproveTarget(result.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--primary-color)] text-white text-xs font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform"
                        >
                          <UserCheck size={12} /> Approve
                        </button>
                      )}
                    </div>
                  )}
                  {result.status === 'completed' && result.approved_by && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle size={12} /> Approved by {result.approved_by}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
