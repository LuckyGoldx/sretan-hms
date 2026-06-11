import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, Upload, FileText, Trash2, Loader2, X, Image as ImageIcon, File, Maximize2,
} from 'lucide-react'

export default function DocumentManager() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<any[]>([])
  const [patient, setPatient] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ document_type: '', file_name: '', notes: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [docRes, patRes] = await Promise.all([
        api.get(`/patients/${patientId}/documents`).catch(() => ({ data: [] })),
        api.get(`/patients/${patientId}`).catch(() => ({ data: null })),
      ])
      setDocuments(docRes.data || [])
      setPatient(patRes.data || null)
    } catch {} finally { setLoading(false) }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setUploadForm((p) => ({ ...p, file_name: file.name }))
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setPreviewUrl(ev.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setPreviewUrl(null)
    }
  }

  async function handleUpload() {
    if (!uploadForm.document_type || !selectedFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('document_type', uploadForm.document_type)
      formData.append('notes', uploadForm.notes || '')
      formData.append('uploaded_by', currentUser?.id || '')

      const res = await api.post(`/patients/${patientId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDocuments((prev) => [res.data, ...prev])
      setShowUpload(false)
      setSelectedFile(null)
      setPreviewUrl(null)
      setUploadForm({ document_type: '', file_name: '', notes: '' })
    } catch {} finally { setUploading(false) }
  }

  async function handleDelete(docId: string) {
    if (!confirm('Delete this document?')) return
    try {
      await api.delete(`/patients/${patientId}/documents/${docId}`)
      setDocuments((prev) => prev.filter((d) => d.id !== docId))
    } catch {}
  }

  const docTypeColor = (t: string) => {
    const map: Record<string, string> = {
      id_card: 'bg-blue-100 text-blue-700', insurance: 'bg-emerald-100 text-emerald-700',
      lab_report: 'bg-purple-100 text-purple-700', referral: 'bg-amber-100 text-amber-700',
      consent: 'bg-rose-100 text-rose-700', prescription: 'bg-indigo-100 text-indigo-700',
      other: 'bg-slate-100 text-slate-600',
    }
    return map[t] || 'bg-slate-100 text-slate-600'
  }

  const isImageExt = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Patient Documents</h1>
            {patient && <p className="text-sm text-slate-400">{patient.full_name} &middot; {patient.hospital_number}</p>}
          </div>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform">
          <Upload size={15} /> Upload Document
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FileText size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No documents uploaded</p>
          <p className="text-xs text-slate-400 mt-1">Upload patient ID cards, insurance forms, referrals, etc.</p>
          <button onClick={() => setShowUpload(true)} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium">
            <Upload size={14} /> Upload First Document
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {documents.map((d: any) => (
            <div key={d.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${docTypeColor(d.document_type)}`}>{d.document_type.replace('_', ' ')}</span>
                <button onClick={() => handleDelete(d.id)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={13} /></button>
              </div>
              {d.file_path && isImageExt(d.file_name) ? (
                <div className="relative group mb-2">
                  <img src={`/api/documents/${d.file_path}`} alt={d.file_name}
                    className="w-full h-36 object-cover rounded-xl border border-slate-100 cursor-pointer"
                    onClick={() => setFullscreenImg(`/api/documents/${d.file_path}`)} />
                  <button onClick={() => setFullscreenImg(`/api/documents/${d.file_path}`)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={12} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{d.file_name}</span>
                </div>
              )}
              {d.notes && <p className="text-xs text-slate-500 mb-2 line-clamp-2">{d.notes}</p>}
              <div className="text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100">
                <span>{new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {d.uploaded_by_name && <span>by {d.uploaded_by_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!uploading) setShowUpload(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Upload size={18} className="text-primary" /> Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Document Type *</label>
                <select value={uploadForm.document_type} onChange={(e) => setUploadForm((p) => ({ ...p, document_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select type...</option>
                  <option value="id_card">ID Card / Passport</option>
                  <option value="insurance">Insurance Card</option>
                  <option value="lab_report">Lab Report</option>
                  <option value="referral">Referral Letter</option>
                  <option value="consent">Consent Form</option>
                  <option value="prescription">Prescription</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">File *</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500">
                    <Upload size={16} />
                    {selectedFile ? selectedFile.name : 'Browse files...'}
                    <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" />
                  </label>
                </div>
              </div>
              {previewUrl && (
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Preview</label>
                  <div className="relative group inline-block">
                    <img src={previewUrl} alt="Preview" className="h-32 w-auto rounded-xl border border-slate-200 object-cover cursor-pointer" onClick={() => setFullscreenImg(previewUrl)} />
                    <button onClick={() => setFullscreenImg(previewUrl)}
                      className="absolute top-2 right-2 p-1 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={12} /></button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} placeholder="Optional notes..." value={uploadForm.notes}
                  onChange={(e) => setUploadForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => { setShowUpload(false); setSelectedFile(null); setPreviewUrl(null) }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !uploadForm.document_type || !selectedFile}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {fullscreenImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="Full preview" className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" onClick={() => setFullscreenImg(null)} />
          <button onClick={() => setFullscreenImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
