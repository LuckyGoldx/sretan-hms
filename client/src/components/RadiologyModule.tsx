import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../hooks/useAxios'
import type { RadiologyOrder } from '../types'
import {
  Scan,
  FileImage,
  FileText,
  Upload,
  Clipboard,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Bold,
  Italic,
  List,
  AlignLeft
} from 'lucide-react'

const TEMPLATE_PHRASES = [
  'Normal findings',
  'No acute pathology',
  'Follow-up recommended',
  'Correlate clinically'
]

export default function RadiologyModule() {
  const [orders, setOrders] = useState<RadiologyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<RadiologyOrder | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [reportText, setReportText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<RadiologyOrder[]>('/radiology-orders')
      setOrders(data || [])
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load imaging orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  function handleSelect(order: RadiologyOrder) {
    if (expandedId === order.id && selectedOrder?.id === order.id) {
      setExpandedId(null)
      setSelectedOrder(null)
      setReportText('')
      setSelectedFile(null)
      setSubmitSuccess(false)
      setSubmitError(null)
      return
    }
    setSelectedOrder(order)
    setExpandedId(order.id)
    setReportText(order.report_text || '')
    setSelectedFile(null)
    setSubmitSuccess(false)
    setSubmitError(null)
  }

  function insertTemplate(phrase: string) {
    const textarea = textareaRef.current
    if (!textarea) {
      setReportText((prev) => (prev ? `${prev}\n${phrase}` : phrase))
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = reportText.substring(0, start)
    const after = reportText.substring(end)
    const newText = `${before}${phrase}${after}`
    setReportText(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      const cursorPos = start + phrase.length
      textarea.setSelectionRange(cursorPos, cursorPos)
    })
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (
      file &&
      ['.png', '.jpg', '.jpeg', '.dcm'].some((ext) => file.name.toLowerCase().endsWith(ext))
    ) {
      setSelectedFile(file)
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  async function handleSubmitReport() {
    if (!selectedOrder) return
    if (!reportText.trim()) {
      setSubmitError('Report text is required')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitSuccess(false)
    try {
      const imagePath = selectedFile ? `/uploads/${selectedFile.name}` : null
      await api.put(`/radiology-orders/${selectedOrder.id}`, {
        report_text: reportText.trim(),
        image_path: imagePath,
        status: 'completed'
      })
      setSubmitSuccess(true)
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? { ...o, report_text: reportText.trim(), image_path: imagePath || o.image_path, status: 'completed' }
            : o
        )
      )
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || err.message || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  function statusBadge(status: string) {
    if (status === 'completed')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <CheckCircle size={12} /> Completed
        </span>
      )
    if (status === 'in_progress')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          In Progress
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
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Scan size={22} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Radiology Module</h1>
            <p className="text-sm text-slate-500">Manage imaging orders, write reports, and upload files</p>
          </div>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform hover:shadow-sm"
        >
          <Loader2 size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Imaging Worklist */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Clipboard size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Imaging Worklist</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-rose-500 gap-2">
              <AlertCircle size={20} /> {error}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Scan size={40} className="mb-2" />
              <p className="text-sm">No imaging orders</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => handleSelect(order)}
                  className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left ${
                    expandedId === order.id ? 'bg-indigo-50/50' : ''
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {expandedId === order.id ? (
                        <ChevronUp size={16} className="text-indigo-500" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {order.imaging_type || 'Imaging'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleDateString()} &middot;{' '}
                        {order.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  {statusBadge(order.status)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Report Editor & File Drop Zone */}
        <div className="space-y-4">
          {/* Report Editor */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-800">Report Editor</h2>
              {selectedOrder && (
                <span className="ml-auto text-xs text-slate-400 truncate max-w-[160px]">
                  {selectedOrder.imaging_type}
                </span>
              )}
            </div>

            {!selectedOrder ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <FileText size={40} className="mb-2" />
                <p className="text-sm">Select an imaging order to write a report</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Formatting Toolbar (Mock) */}
                <div className="flex items-center gap-1 pb-2 border-b border-slate-100">
                  <button
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Bold"
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Italic"
                  >
                    <Italic size={16} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Bullet List"
                  >
                    <List size={16} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                    title="Align Left"
                  >
                    <AlignLeft size={16} />
                  </button>
                  <span className="text-slate-200 mx-2">|</span>
                  <span className="text-xs text-slate-400">Formatting (mock)</span>
                </div>

                {/* Template Phrase Buttons */}
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      onClick={() => insertTemplate(phrase)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100 hover:bg-indigo-100 hover:scale-[1.01] active:scale-[0.99] transition-transform"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>

                {/* Report Textarea */}
                <textarea
                  ref={textareaRef}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Enter radiology report..."
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                />
              </div>
            )}
          </div>

          {/* File Drop Zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <FileImage size={18} className="text-indigo-500" />
              <h2 className="font-semibold text-slate-800">Image Upload</h2>
            </div>

            <div className="p-5">
              {selectedFile ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileImage size={20} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                  >
                    <AlertCircle size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleFileDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <Upload
                    size={36}
                    className={`mb-3 ${dragOver ? 'text-indigo-500' : 'text-slate-300'}`}
                  />
                  <p className="text-sm font-medium text-slate-600">
                    {dragOver ? 'Drop image here' : 'Drag & drop or click to upload'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, DCM accepted</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.dcm"
                onChange={handleFileInput}
                className="hidden"
              />

              {/* Submit Report */}
              {selectedOrder && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {submitSuccess ? (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">
                      <CheckCircle size={16} /> Report submitted successfully
                    </div>
                  ) : (
                    <>
                      {submitError && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mb-3">
                          <AlertCircle size={12} /> {submitError}
                        </p>
                      )}
                      <button
                        onClick={handleSubmitReport}
                        disabled={submitting || !reportText.trim()}
                        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 hover:scale-[1.01] active:scale-[0.99] transition-transform disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        Submit Report
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
