import { useState, useEffect } from 'react'
import {
  Banknote,
  Receipt,
  BarChart3,
  AlertCircle,
  PlusCircle,
  FileSpreadsheet,
  Search,
  X,
  CheckCircle,
  Calendar
} from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient, BillingInvoice } from '../types/index'

interface Expense {
  id: string
  date: string
  description: string
  category: string
  amount: number
}

interface BatchPatient extends Patient {
  encounterTotal?: number
  selected: boolean
}

const EXPENSE_CATEGORIES = ['Materials', 'Vendor', 'Budget Allocation'] as const

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN'
  }).format(amount)
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export default function FinanceHMO() {
  // HMO Batch
  const [allPatients, setAllPatients] = useState<BatchPatient[]>([])
  const [insuranceFilter, setInsuranceFilter] = useState('')
  const [batchView, setBatchView] = useState(false)
  const [batchTotal, setBatchTotal] = useState(0)
  const [loadingPatients, setLoadingPatients] = useState(true)

  // Expense Ledger
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    category: 'Materials' as string,
    amount: 0
  })

  // Revenue Audit
  const [auditDate, setAuditDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [allInvoices, setAllInvoices] = useState<BillingInvoice[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoadingPatients(true)
    api.get<Patient[]>('/patients')
      .then((res) => {
        setAllPatients(
          res.data.map((p) => ({ ...p, selected: false }))
        )
      })
      .catch(() => setError('Failed to load patients'))
      .finally(() => setLoadingPatients(false))
  }, [])

  function togglePatientSelection(id: string) {
    setAllPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    )
  }

  function compileBatch() {
    const selected = allPatients.filter((p) => p.selected)
    if (selected.length === 0) return
    const total = selected.reduce(
      (sum, p) => sum + (p.encounterTotal || 15000),
      0
    )
    setBatchTotal(total)
    setBatchView(true)
  }

  function resetBatch() {
    setBatchView(false)
    setBatchTotal(0)
    setAllPatients((prev) =>
      prev.map((p) => ({ ...p, selected: false }))
    )
  }

  const filteredPatients = allPatients.filter((p) =>
    p.insurance?.toLowerCase().includes(insuranceFilter.toLowerCase())
  )

  // Expense handlers
  function handleAddExpense() {
    if (!expenseForm.description || expenseForm.amount <= 0) return
    const newExpense: Expense = {
      id: generateId(),
      date: new Date().toISOString(),
      description: expenseForm.description,
      category: expenseForm.category,
      amount: expenseForm.amount
    }
    setExpenses((prev) => [newExpense, ...prev])
    setExpenseForm({ description: '', category: 'Materials', amount: 0 })
    setShowExpenseModal(false)
  }

  // Revenue Audit
  useEffect(() => {
    setLoadingAudit(true)
    api
      .get<BillingInvoice[]>('/invoices')
      .then((res) => setAllInvoices(res.data))
      .catch(() => setError('Failed to load invoice data'))
      .finally(() => setLoadingAudit(false))
  }, [])

  const dayInvoices = allInvoices.filter((inv) =>
    inv.created_at?.startsWith(auditDate)
  )

  const totalCashCollected = dayInvoices.reduce(
    (sum, inv) => sum + inv.amount_paid,
    0
  )
  const totalTreatments = dayInvoices.length
  const hasDiscrepancy =
    totalCashCollected > 0 && totalTreatments > 0 && totalCashCollected !== totalTreatments * 25000

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Finance & HMO Management
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Insurance billing, expenses & revenue oversight
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* HMO Batch Invoice Tool */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-800">
              HMO Batch Invoice
            </h2>
          </div>

          {!batchView ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by insurance provider..."
                  value={insuranceFilter}
                  onChange={(e) => setInsuranceFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-xl">
                {loadingPatients ? (
                  <div className="p-4 text-sm text-slate-400 text-center">
                    Loading patients...
                  </div>
                ) : filteredPatients.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400 text-center">
                    No patients match the filter
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500 w-10">
                          <input
                            type="checkbox"
                            checked={filteredPatients.every((p) => p.selected)}
                            onChange={() => {
                              const allSelected = filteredPatients.every(
                                (p) => p.selected
                              )
                              setAllPatients((prev) =>
                                prev.map((p) =>
                                  filteredPatients.some((fp) => fp.id === p.id)
                                    ? { ...p, selected: !allSelected }
                                    : p
                                )
                              )
                            }}
                            className="rounded"
                          />
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">
                          Patient
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">
                          Insurance
                        </th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">
                          Est. Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map((patient) => (
                        <tr
                          key={patient.id}
                          className="border-t border-slate-50 hover:bg-blue-50/50 transition-colors"
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={patient.selected}
                              onChange={() => togglePatientSelection(patient.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">
                            {patient.full_name}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {patient.insurance || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                            {formatCurrency(patient.encounterTotal || 15000)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <button
                onClick={compileBatch}
                disabled={!filteredPatients.some((p) => p.selected)}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Compile Batch (
                {filteredPatients.filter((p) => p.selected).length} selected)
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700">
                  Batch Invoice Summary
                </h3>
                <button
                  onClick={resetBatch}
                  className="text-xs text-primary hover:text-blue-700 transition-colors"
                >
                  Start Over
                </button>
              </div>
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100">
                {allPatients
                  .filter((p) => p.selected)
                  .map((patient) => (
                    <div
                      key={patient.id}
                      className="flex justify-between items-center px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-700">
                          {patient.full_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {patient.insurance} · Encounter
                        </p>
                      </div>
                      <span className="font-medium text-slate-700">
                        {formatCurrency(patient.encounterTotal || 15000)}
                      </span>
                    </div>
                  ))}
              </div>
              <div className="flex justify-between items-center pt-3 border-t-2 border-double border-slate-300">
                <span className="font-bold text-slate-800">Batch Total</span>
                <span className="font-bold text-lg text-primary">
                  {formatCurrency(batchTotal)}
                </span>
              </div>
              <button className="w-full px-4 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Submit for Processing
              </button>
            </div>
          )}
        </div>

        {/* Operational Expense Ledger */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-slate-800">
                Expense Ledger
              </h2>
            </div>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-xl text-xs font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {expenses.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                No expenses recorded yet
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">
                      Date
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">
                      Description
                    </th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">
                      Category
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-slate-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr
                      key={exp.id}
                      className="border-t border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-slate-500 text-xs">
                        {new Date(exp.date).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">
                        {exp.description}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-xs">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-700">
                        {formatCurrency(exp.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {expenses.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between text-sm font-bold text-slate-800">
              <span>Total Expenses</span>
              <span>
                {formatCurrency(
                  expenses.reduce((sum, e) => sum + e.amount, 0)
                )}
              </span>
            </div>
          )}
        </div>

        {/* Revenue Audit Interface */}
        <div className="xl:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-slate-800">
              Revenue Audit
            </h2>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={auditDate}
              onChange={(e) => setAuditDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          {loadingAudit ? (
            <div className="text-center py-6 text-sm text-slate-400">
              Loading audit data...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">Total Collected</p>
                  <p className="text-xl font-bold text-emerald-600">
                    {formatCurrency(totalCashCollected)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">
                    Total Treatments
                  </p>
                  <p className="text-xl font-bold text-slate-700">
                    {totalTreatments}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 mb-1">
                    Avg per Treatment
                  </p>
                  <p className="text-xl font-bold text-slate-700">
                    {totalTreatments > 0
                      ? formatCurrency(
                          Math.round(totalCashCollected / totalTreatments)
                        )
                      : '₦0.00'}
                  </p>
                </div>
              </div>

              {hasDiscrepancy && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Discrepancy detected: Collected amount does not match expected
                    revenue for {totalTreatments} treatment(s).
                  </span>
                </div>
              )}

              {!hasDiscrepancy && totalCashCollected > 0 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>All figures match. No discrepancies found.</span>
                </div>
              )}

              {totalCashCollected === 0 && totalTreatments === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">
                  No transactions recorded for this date
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                Add Expense
              </h3>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Expense description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, category: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount (₦)
                </label>
                <input
                  type="number"
                  value={expenseForm.amount || ''}
                  onChange={(e) =>
                    setExpenseForm({
                      ...expenseForm,
                      amount: Number(e.target.value)
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="0"
                />
              </div>
              <button
                onClick={handleAddExpense}
                disabled={!expenseForm.description || expenseForm.amount <= 0}
                className="w-full px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Record Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
