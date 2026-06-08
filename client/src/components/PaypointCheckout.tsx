import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Receipt,
  Wallet,
  CreditCard,
  Building2,
  ArrowRight,
  CheckCircle,
  Search,
  PlusCircle,
  User,
  Clock
} from 'lucide-react'
import api from '../hooks/useAxios'
import type { Patient, BillingInvoice } from '../types/index'

interface LineItem {
  description: string
  amount: number
}

type PaymentChannel = 'cash' | 'card' | 'transfer'

interface PaymentDetail {
  channel: PaymentChannel
  amount: number
  cardLast4?: string
  reference?: string
  bankName?: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN'
  }).format(amount)
}

function formatDateTime(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())
}

export default function PaypointCheckout() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', amount: 0 }
  ])
  const [totalAmount, setTotalAmount] = useState(0)
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([])
  const [activeChannels, setActiveChannels] = useState<PaymentChannel[]>([])
  const [walletBalance] = useState(125000)
  const [depositAmount, setDepositAmount] = useState(0)
  const [currentTime, setCurrentTime] = useState(formatDateTime())
  const [loadingPatients, setLoadingPatients] = useState(true)
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [cardLast4, setCardLast4] = useState('')
  const [cardReference, setCardReference] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [transferBank, setTransferBank] = useState('')
  const [cashTendered, setCashTendered] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(formatDateTime())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setLoadingPatients(true)
    api.get<Patient[]>('/patients')
      .then((res) => setPatients(res.data))
      .catch(() => setError('Failed to load patients'))
      .finally(() => setLoadingPatients(false))
  }, [])

  const loadInvoices = useCallback((patientId: string) => {
    setLoadingInvoices(true)
    api.get<BillingInvoice[]>('/invoices', { params: { patient_id: patientId } })
      .then((res) => {
        setInvoices(res.data)
        if (res.data.length > 0) {
          const invoice = res.data[0]
          setSelectedInvoice(invoice)
          setTotalAmount(invoice.total_amount)
          setLineItems([{ description: 'Consultation', amount: invoice.total_amount }])
        } else {
          setSelectedInvoice(null)
          setLineItems([{ description: '', amount: 0 }])
          setTotalAmount(0)
        }
      })
      .catch(() => setError('Failed to load invoices'))
      .finally(() => setLoadingInvoices(false))
  }, [])

  useEffect(() => {
    if (selectedPatient) {
      loadInvoices(selectedPatient.id)
    }
  }, [selectedPatient, loadInvoices])

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient)
    setPatientSearch('')
    setError('')
    setSuccessMsg('')
    setPaymentDetails([])
    setActiveChannels([])
  }

  function handleLineItemChange(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
    const total = updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    setTotalAmount(total)
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: '', amount: 0 }])
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return
    const updated = lineItems.filter((_, i) => i !== index)
    setLineItems(updated)
    const total = updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    setTotalAmount(total)
  }

  async function handleCreateInvoice() {
    if (!selectedPatient) return
    setCreatingInvoice(true)
    setError('')
    try {
      const res = await api.post<BillingInvoice>('/invoices', {
        patient_id: selectedPatient.id,
        total_amount: totalAmount,
        line_items: lineItems.filter((i) => i.description && i.amount > 0)
      })
      setSelectedInvoice(res.data)
      setInvoices([res.data])
      setSuccessMsg('Invoice created successfully')
    } catch {
      setError('Failed to create invoice')
    } finally {
      setCreatingInvoice(false)
    }
  }

  function toggleChannel(channel: PaymentChannel) {
    setActiveChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    )
  }

  function buildPaymentDetails(): PaymentDetail[] {
    const details: PaymentDetail[] = []
    for (const ch of activeChannels) {
      if (ch === 'cash') {
        details.push({ channel: 'cash', amount: cashTendered || 0 })
      } else if (ch === 'card') {
        details.push({
          channel: 'card',
          amount: 0,
          cardLast4,
          reference: cardReference
        })
      } else if (ch === 'transfer') {
        details.push({
          channel: 'transfer',
          amount: 0,
          reference: transferReference,
          bankName: transferBank
        })
      }
    }
    return details
  }

  async function handleProcessPayment() {
    if (!selectedInvoice) return
    setProcessingPayment(true)
    setError('')
    try {
      const details = buildPaymentDetails()
      const totalPaid = Object.values(details).reduce(
        (sum, d) => sum + (d.amount || 0),
        0
      )
      await api.put(`/invoices/${selectedInvoice.id}/pay`, {
        payment_method: activeChannels,
        amount_paid: totalPaid,
        payment_details: details
      })
      const updatedInvoice = {
        ...selectedInvoice,
        amount_paid: selectedInvoice.amount_paid + totalPaid,
        balance: selectedInvoice.balance - totalPaid,
        payment_method: activeChannels.join(',')
      }
      setSelectedInvoice(updatedInvoice)
      setSuccessMsg('Payment processed successfully')
      setActiveChannels([])
      setCashTendered(0)
      setCardLast4('')
      setCardReference('')
      setTransferReference('')
      setTransferBank('')
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
      )
    } catch {
      setError('Failed to process payment')
    } finally {
      setProcessingPayment(false)
    }
  }

  function handleDeposit() {
    if (depositAmount > 0) {
      setSuccessMsg(`₦${depositAmount.toLocaleString()} deposited to wallet`)
      setDepositAmount(0)
    }
  }

  const filteredPatients = patients.filter((p) =>
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase())
  )

  const progressPercent = selectedInvoice
    ? Math.min(
        Math.round((selectedInvoice.amount_paid / selectedInvoice.total_amount) * 100),
        100
      )
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Paypoint Checkout</h1>
            <p className="text-sm text-slate-400 mt-1">Hospital payment & billing center</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
          <Clock className="w-4 h-4 text-primary" />
          <span>{currentTime}</span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Invoice Card */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-slate-800">Invoice</h2>
            </div>

            {/* Patient Selector */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search patient by name..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              {patientSearch && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-100 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                  {loadingPatients ? (
                    <div className="p-3 text-sm text-slate-400">Loading...</div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="p-3 text-sm text-slate-400">No patients found</div>
                  ) : (
                    filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2 transition-colors"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-700">
                          {patient.full_name}
                        </span>
                        <span className="text-slate-400 text-xs ml-auto">
                          {patient.insurance || 'Self'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedPatient && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl mb-4 text-sm">
                <span className="font-medium text-blue-700">
                  {selectedPatient.full_name}
                </span>
                <span className="text-blue-400">|</span>
                <span className="text-blue-600">{selectedPatient.phone}</span>
              </div>
            )}

            {/* Loading State */}
            {loadingInvoices && (
              <div className="text-center py-8 text-sm text-slate-400">
                Loading invoices...
              </div>
            )}

            {/* No Invoice / Create */}
            {!loadingInvoices && selectedPatient && !selectedInvoice && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  No invoice found. Create a new invoice:
                </p>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Description (e.g. Consultation)"
                        value={item.description}
                        onChange={(e) =>
                          handleLineItemChange(idx, 'description', e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                    <div className="w-40">
                      <input
                        type="number"
                        placeholder="Amount"
                        value={item.amount || ''}
                        onChange={(e) =>
                          handleLineItemChange(idx, 'amount', Number(e.target.value))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <button
                        onClick={() => removeLineItem(idx)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addLineItem}
                  className="flex items-center gap-1 text-sm text-primary hover:text-blue-700 transition-colors"
                >
                  <PlusCircle className="w-4 h-4" /> Add line item
                </button>
                <div className="text-right text-lg font-bold text-slate-800 pt-2 border-t border-slate-100">
                  Total: {formatCurrency(totalAmount)}
                </div>
                <button
                  onClick={handleCreateInvoice}
                  disabled={creatingInvoice || totalAmount <= 0}
                  className="w-full px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            )}

            {/* Invoice Receipt Display */}
            {!loadingInvoices && selectedInvoice && (
              <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                <div className="text-center mb-4">
                  <Receipt className="w-8 h-8 text-primary mx-auto mb-1" />
                  <p className="text-xs text-slate-400 font-mono">
                    INV-{selectedInvoice.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  {lineItems
                    .filter((i) => i.description)
                    .map((item, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between text-slate-700">
                          <span>{item.description}</span>
                          <span className="font-medium">
                            {formatCurrency(item.amount)}
                          </span>
                        </div>
                        {idx < lineItems.filter((i) => i.description).length - 1 && (
                          <div className="border-t border-dashed border-slate-200 my-2" />
                        )}
                      </div>
                    ))}
                </div>
                <div className="border-t-2 border-double border-slate-300 mt-3 pt-3 flex justify-between font-bold text-base text-slate-800">
                  <span>Total</span>
                  <span>{formatCurrency(selectedInvoice.total_amount)}</span>
                </div>

                {/* Amount Paid / Balance */}
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Amount Paid</span>
                    <span className="font-medium text-emerald-600">
                      {formatCurrency(selectedInvoice.amount_paid)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Balance</span>
                    <span className="font-medium text-rose-600">
                      {formatCurrency(selectedInvoice.balance)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-right">
                    {progressPercent}% paid
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Multi-Channel Payment */}
          {selectedInvoice && selectedInvoice.balance > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-slate-800">
                  Multi-Channel Payment
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                {(
                  [
                    { key: 'cash' as PaymentChannel, label: 'Cash', icon: Wallet },
                    { key: 'card' as PaymentChannel, label: 'Card', icon: CreditCard },
                    {
                      key: 'transfer' as PaymentChannel,
                      label: 'Transfer',
                      icon: Building2
                    }
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => toggleChannel(key)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      activeChannels.includes(key)
                        ? 'border-primary bg-blue-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon
                      className={`w-6 h-6 ${
                        activeChannels.includes(key)
                          ? 'text-primary'
                          : 'text-slate-400'
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        activeChannels.includes(key)
                          ? 'text-primary'
                          : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Cash Sub-form */}
              {activeChannels.includes('cash') && (
                <div className="p-4 bg-slate-50 rounded-xl mb-3 border border-slate-100">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Amount Tendered (₦)
                  </label>
                  <input
                    type="number"
                    value={cashTendered || ''}
                    onChange={(e) => setCashTendered(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    placeholder="Enter cash amount"
                  />
                </div>
              )}

              {/* Card Sub-form */}
              {activeChannels.includes('card') && (
                <div className="p-4 bg-slate-50 rounded-xl mb-3 border border-slate-100 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Card Last 4 Digits
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={cardLast4}
                      onChange={(e) =>
                        setCardLast4(e.target.value.replace(/\D/g, ''))
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="****"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Card Reference
                    </label>
                    <input
                      type="text"
                      value={cardReference}
                      onChange={(e) => setCardReference(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Transaction reference"
                    />
                  </div>
                </div>
              )}

              {/* Transfer Sub-form */}
              {activeChannels.includes('transfer') && (
                <div className="p-4 bg-slate-50 rounded-xl mb-3 border border-slate-100 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Transaction Reference
                    </label>
                    <input
                      type="text"
                      value={transferReference}
                      onChange={(e) => setTransferReference(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="Enter reference"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={transferBank}
                      onChange={(e) => setTransferBank(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. GTBank"
                    />
                  </div>
                </div>
              )}

              {activeChannels.length > 0 && (
                <button
                  onClick={handleProcessPayment}
                  disabled={processingPayment}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50"
                >
                  {processingPayment ? (
                    'Processing...'
                  ) : (
                    <>
                      Process Payment <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Wallet Card */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-sm p-6 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-5 h-5" />
              <h3 className="text-sm font-medium opacity-90">Advance Deposit</h3>
            </div>
            <p className="text-3xl font-bold mt-2">
              {formatCurrency(walletBalance)}
            </p>
            <p className="text-xs opacity-75 mt-1">Available Balance</p>
            <div className="mt-4 pt-4 border-t border-white/20">
              <label className="block text-xs font-medium opacity-90 mb-1">
                Quick Deposit
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={depositAmount || ''}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/50 outline-none text-sm"
                  placeholder="Amount"
                />
                <button
                  onClick={handleDeposit}
                  className="px-4 py-2 bg-white text-blue-600 rounded-xl text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Today's Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Transactions</span>
              <span className="font-medium text-slate-700">{invoices.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Outstanding</span>
              <span className="font-medium text-rose-600">
                {selectedInvoice
                  ? formatCurrency(selectedInvoice.balance)
                  : '₦0.00'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Total Collected</span>
              <span className="font-medium text-emerald-600">
                {selectedInvoice
                  ? formatCurrency(selectedInvoice.amount_paid)
                  : '₦0.00'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
