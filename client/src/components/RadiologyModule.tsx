import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import DoctorComment from './DoctorComment'
import ConsultantTag from './ConsultantTag'
import type { RadiologyOrder } from '../types'
import {
  ArrowLeft,
  Scan,
  FileText,
  Upload,
  Clipboard,
  Loader2,
  CheckCircle,
  AlertCircle,
  Bold,
  Italic,
  List,
  AlignLeft,
  X
} from 'lucide-react'

const TEMPLATE_PHRASES = [
  'Normal findings',
  'No acute pathology',
  'Follow-up recommended',
  'Correlate clinically'
]

export default function RadiologyModule() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<RadiologyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedOrder, setSelectedOrder] = useState<RadiologyOrder | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  const [reportText, setReportText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get<RadiologyOrder[]>('/radiology-orders?is_paid=true')
      setOrders((data || []).filter((o: any) => o.status === 'ordered' || o.status === 'rejected'))
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load imaging orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  function openEditor(order: RadiologyOrder) {
    setSelectedOrder(order)
    setShowEditor(true)
    setReportText(order.report_text || '')
    setSelectedFiles([])
    setExistingImages(order.image_path ? order.image_path.split(',').filter(Boolean) : [])
    setSubmitSuccess(false)
    setSubmitError(null)
  }

  function closeEditor() {
    setSelectedOrder(null)
    setShowEditor(false)
    setReportText('')
    setSelectedFiles([])
    setExistingImages([])
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
    var files = Array.from(e.dataTransfer.files).filter((f) =>
      ['.png', '.jpg', '.jpeg', '.dcm'].some((ext) => f.name.toLowerCase().endsWith(ext))
    )
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...files])
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    var files = Array.from(e.target.files || []).filter((f) =>
      ['.png', '.jpg', '.jpeg', '.dcm'].some((ext) => f.name.toLowerCase().endsWith(ext))
    )
    if (files.length > 0) setSelectedFiles((prev) => [...prev, ...files])
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
      const currentStaffId = (() => { try { return JSON.parse(localStorage.getItem('sretan_user') || '{}').id } catch {} return null })()
      var uploadedPaths: string[] = []
      for (const file of selectedFiles) {
        var formData = new FormData()
        formData.append('file', file)
        var uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        uploadedPaths.push(uploadRes.data?.path || `/uploads/${file.name}`)
      }
      var allImagePaths = [...existingImages, ...uploadedPaths].join(',')
      await api.put(`/radiology-orders/${selectedOrder.id}`, {
        report_text: reportText.trim(),
        image_path: allImagePaths || null,
        status: 'review',
        reported_by: currentStaffId
      })
      setSubmitSuccess(true)
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? { ...o, report_text: reportText.trim(), image_path: allImagePaths || o.image_path, status: 'review' }
            : o
        ).filter((o: any) => o.status === 'ordered' || o.status === 'rejected')
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
    if (status === 'review')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
          In Review
        </span>
      )
    if (status === 'rejected')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
          Rejected - Review
        </span>
      )
    if (status === 'processing')
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          Processing
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
          <button onClick={() => navigate('/radiology')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Scan size={22} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Radiology Worklist</h1>
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

      <div className="grid grid-cols-1 gap-6">
        {/* Imaging Worklist */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Clipboard size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-800">Imaging Worklist</h2>
            {orders.length > 0 && <span className="ml-auto text-xs text-slate-400">{orders.length} order(s)</span>}
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
                  <div key={order.id}
                   className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <Scan size={16} className="text-indigo-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {order.imaging_type || 'Imaging'}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {((order as any).is_consultation || (order as any).doctor_role === 'Consultant') && (
                            <ConsultantTag departmentName={(order as any).department_name} />
                          )}
                          <p className="text-xs text-slate-500">
                            {order.patient_name || 'Walk-in'} &middot; {order.doctor_name ? `Dr. ${order.doctor_name}` : ''}
                            {order.imaging_number && <span className="ml-1 font-mono">{order.imaging_number}</span>}
                          </p>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {order.doctor_comment && <DoctorComment comment={order.doctor_comment} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {statusBadge(order.status)}
                      <button onClick={() => openEditor(order)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors">Enter Result</button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Entry Modal */}
      {showEditor && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeEditor}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-indigo-500" />
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Report Editor — {selectedOrder.imaging_type}</h2>
                  {selectedOrder.patient_name && <p className="text-xs text-slate-400">{selectedOrder.patient_name} {selectedOrder.imaging_number ? `· ${selectedOrder.imaging_number}` : ''}</p>}
                  {selectedOrder.doctor_comment && <DoctorComment comment={selectedOrder.doctor_comment} />}
                </div>
              </div>
              <button onClick={closeEditor} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Formatting Toolbar (Mock) */}
              <div className="flex items-center gap-1 pb-2 border-b border-slate-100">
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Bold"><Bold size={16} /></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Italic"><Italic size={16} /></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Bullet List"><List size={16} /></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Align Left"><AlignLeft size={16} /></button>
                <span className="text-slate-200 mx-2">|</span>
                <span className="text-xs text-slate-400">Formatting (mock)</span>
              </div>

              {/* Template Phrase Buttons */}
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_PHRASES.map((phrase) => (
                  <button key={phrase} onClick={() => insertTemplate(phrase)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100 hover:bg-indigo-100 hover:scale-[1.01] transition-transform">
                    {phrase}
                  </button>
                ))}
              </div>

              {/* Report Textarea */}
              <textarea ref={textareaRef} value={reportText} onChange={(e) => setReportText(e.target.value)}
                placeholder="Enter radiology report..."
                rows={8}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y" />

              {/* Image Upload */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Images</h4>
                {/* Existing + newly uploaded image grid */}
                {(existingImages.length > 0 || selectedFiles.length > 0) && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
                    {existingImages.map((path, idx) => (
                      <div key={`e-${idx}`} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                        <img src={path} alt={`Image ${idx + 1}`}
                          className="w-full h-20 object-cover cursor-pointer"
                          onClick={() => setPreviewImage(path)}
                          onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex items-center justify-center h-20 text-slate-300 text-xs">N/A</div>' }} />
                        <button onClick={() => setExistingImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500">
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {selectedFiles.map((file, idx) => (
                      <div key={`n-${idx}`} className="relative group rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                        <img src={URL.createObjectURL(file)} alt={file.name}
                          className="w-full h-20 object-cover"
                          onClick={() => setPreviewImage(URL.createObjectURL(file))} />
                        <button onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500">
                          <X size={10} />
                        </button>
                        <span className="absolute bottom-0.5 left-1 text-[8px] text-white bg-black/50 px-1 rounded truncate max-w-[90%]">{file.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Drop zone */}
                <div onDrop={handleFileDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}>
                  <Upload size={28} className={`mb-1 ${dragOver ? 'text-indigo-500' : 'text-slate-300'}`} />
                  <p className="text-sm font-medium text-slate-600">{dragOver ? 'Drop images here' : 'Click or drag images'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">PNG, JPG, DCM · Multiple allowed</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.dcm" multiple onChange={handleFileInput} className="hidden" />
              </div>

              {/* Submit */}
              {submitError && <p className="text-xs text-rose-600 flex items-center gap-1"><AlertCircle size={12} /> {submitError}</p>}
              {submitSuccess && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm"><CheckCircle size={16} /> Report submitted successfully</div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 flex-shrink-0">
              {submitSuccess ? (
                <button onClick={closeEditor} className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">Close</button>
              ) : (
                <>
                  <button onClick={closeEditor} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Cancel</button>
                  <button onClick={handleSubmitReport} disabled={submitting || !reportText.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 hover:scale-[1.01] transition-transform disabled:opacity-50">
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Submit Report
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Image Preview */}
      {previewImage && (
        <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center" onClick={() => setPreviewImage(null)}>
          <div className="absolute top-4 right-4 z-10">
            <button onClick={() => setPreviewImage(null)} className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <X size={22} className="text-white" />
            </button>
          </div>
          <img src={previewImage} alt="Preview" className="max-w-[95vw] max-h-[95vh] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
