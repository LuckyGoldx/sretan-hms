import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import { compressImage } from '../utils/compressImage'
import {
  ArrowLeft, User, FileText, Clock, Edit2, Upload, Trash2, X, Loader2, Save, Home, Calendar, Shield, Phone, Mail, MapPin, Heart, Briefcase, Globe, Users, Activity, Maximize2, AlertTriangle,
} from 'lucide-react'

type Tab = 'demographics' | 'documents' | 'history'

export default function RecordsPatientDetail() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('demographics')
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ document_type: '', file_name: '', notes: '' })
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null)
  const [detailDoc, setDetailDoc] = useState<any | null>(null)
  const [detailEditName, setDetailEditName] = useState('')
  const [detailEditNotes, setDetailEditNotes] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [patRes, docRes, auditRes] = await Promise.all([
        api.get(`/patients/${patientId}`).catch(() => ({ data: null })),
        api.get(`/patients/${patientId}/documents`).catch(() => ({ data: [] })),
        api.get(`/patients/${patientId}/audit`).catch(() => ({ data: [] })),
      ])
      setPatient(patRes.data || null)
      setDocuments(docRes.data || [])
      setAuditLogs(auditRes.data || [])
    } catch {} finally { setLoading(false) }
  }

  async function handleSave() {
    if (!patient) return
    setSaving(true)
    try {
      const res = await api.put(`/patients/${patient.id}`, editForm)
      setPatient((prev: any) => ({ ...prev, ...res.data }))
      setShowEdit(false)
      loadData()
    } catch {} finally { setSaving(false) }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0]!
    if (!file) return
    var compressed = await compressImage(file)
    setSelectedFile(compressed)
    setUploadForm((p: any) => ({ ...p, file_name: compressed.name }))
    if (compressed.type.startsWith('image/')) {
      var reader = new FileReader()
      reader.onload = function(ev) { setPreviewUrl((ev.target as any)?.result as string) }
      reader.readAsDataURL(compressed)
    } else {
      setPreviewUrl(null)
    }
  }

  async function handleUpload() {
    if (!uploadForm.document_type || !selectedFile) return
    setUploading(true)
    try {
      var formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('document_type', uploadForm.document_type)
      formData.append('notes', uploadForm.notes || '')
      formData.append('uploaded_by', currentUser?.id || '')
      await api.post(`/patients/${patientId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setShowUpload(false)
      setSelectedFile(null)
      setPreviewUrl(null)
      setUploadForm({ document_type: '', file_name: '', notes: '' })
      var docRes = await api.get(`/patients/${patientId}/documents`)
      setDocuments(docRes.data || [])
    } catch {} finally { setUploading(false) }
  }

  function openDetail(doc: any) {
    setDetailDoc(doc)
    setDetailEditName(doc.file_name)
    setDetailEditNotes(doc.notes || '')
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await api.delete(`/patients/${patientId}/documents/${confirmDelete.id}`)
      setDocuments((prev) => prev.filter((d) => d.id !== confirmDelete.id))
      setConfirmDelete(null)
      if (detailDoc && detailDoc.id === confirmDelete.id) setDetailDoc(null)
    } catch {} finally { setDeleting(false) }
  }

  async function handleDetailSave() {
    if (!detailDoc) return
    setSavingDetail(true)
    try {
      await api.put(`/patients/${patientId}/documents/${detailDoc.id}/meta`, { file_name: detailEditName, notes: detailEditNotes })
      setDocuments((prev) => prev.map((d) => d.id === detailDoc.id ? { ...d, file_name: detailEditName, notes: detailEditNotes } : d))
      setDetailDoc(function(prev: any) { return prev ? { ...prev, file_name: detailEditName, notes: detailEditNotes } : null })
    } catch {} finally { setSavingDetail(false) }
  }

  const isImageExt = (name: string) => { return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name) }

  const docTypeColor = (t: string) => {
    const map: Record<string, string> = {
      id_card: 'bg-blue-100 text-blue-700', insurance: 'bg-emerald-100 text-emerald-700',
      lab_report: 'bg-purple-100 text-purple-700', referral: 'bg-amber-100 text-amber-700',
      consent: 'bg-rose-100 text-rose-700', prescription: 'bg-indigo-100 text-indigo-700',
      other: 'bg-slate-100 text-slate-600',
    }
    return map[t] || 'bg-slate-100 text-slate-600'
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      checked_in: 'bg-blue-100 text-blue-700', in_triage: 'bg-amber-100 text-amber-700',
      waiting: 'bg-purple-100 text-purple-700', with_doctor: 'bg-indigo-100 text-indigo-700',
      discharged: 'bg-slate-100 text-slate-600',
    }
    return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${map[s] || 'bg-slate-100 text-slate-600'}`}>{s?.replace('_', ' ') || 'Unknown'}</span>
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'demographics', label: 'Demographics', icon: User },
    { id: 'documents', label: `Documents (${documents.length})`, icon: FileText },
    { id: 'history', label: `History (${auditLogs.length})`, icon: Clock },
  ]

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!patient) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400"><p>Patient not found</p></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/records/patients')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-800">{patient.full_name}</h1>
              {statusBadge(patient.status)}
            </div>
            <p className="text-sm text-slate-400">{patient.hospital_number} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; Reg: {new Date(patient.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowEdit(true); setEditForm({ full_name: patient.full_name, dob: patient.dob?.slice(0, 10), sex: patient.sex, phone: patient.phone || '', email: patient.email || '', address: patient.address || '', next_of_kin: patient.next_of_kin || '', emergency_contact_name: patient.emergency_contact_name || '', emergency_contact_phone: patient.emergency_contact_phone || '', insurance: patient.insurance || '', blood_type: patient.blood_type || '', occupation: patient.occupation || '', marital_status: patient.marital_status || '', nationality: patient.nationality || '' }) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><Edit2 size={15} /> Edit
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"><Upload size={15} /> Upload</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab: Demographics */}
      {tab === 'demographics' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Personal Information</h3>
              <div className="space-y-3">
                {[
                  { icon: User, label: 'Full Name', value: patient.full_name },
                  { icon: Calendar, label: 'Date of Birth', value: patient.dob?.slice(0, 10) || '—' },
                  { icon: Users, label: 'Sex', value: patient.sex || '—' },
                  { icon: Heart, label: 'Marital Status', value: patient.marital_status || '—' },
                  { icon: Globe, label: 'Nationality', value: patient.nationality || '—' },
                  { icon: Briefcase, label: 'Occupation', value: patient.occupation || '—' },
                  { icon: Activity, label: 'Blood Type', value: patient.blood_type || '—' },
                  { icon: Shield, label: 'Insurance', value: patient.insurance || '—' },
                ].map((f) => {
                  const Icon = f.icon
                  return (
                    <div key={f.label} className="flex items-center gap-3">
                      <Icon size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span>
                      <span className="text-sm font-medium text-slate-800 truncate">{f.value}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact</h3>
              <div className="space-y-3">
                {[
                  { icon: Phone, label: 'Phone', value: patient.phone || '—' },
                  { icon: Mail, label: 'Email', value: patient.email || '—' },
                  { icon: MapPin, label: 'Address', value: patient.address || '—' },
                ].map((f) => {
                  const Icon = f.icon
                  return (
                    <div key={f.label} className="flex items-center gap-3">
                      <Icon size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span>
                      <span className="text-sm font-medium text-slate-800 truncate">{f.value}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency</h3>
                <div className="space-y-3">
                  {[
                    { icon: Users, label: 'Next of Kin', value: patient.next_of_kin || '—' },
                    { icon: User, label: 'Emergency Contact', value: patient.emergency_contact_name || '—' },
                    { icon: Phone, label: 'Emergency Phone', value: patient.emergency_contact_phone || '—' },
                  ].map((f) => {
                    const Icon = f.icon
                    return (
                      <div key={f.label} className="flex items-center gap-3">
                        <Icon size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span>
                        <span className="text-sm font-medium text-slate-800 truncate">{f.value}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Documents */}
      {tab === 'documents' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Uploaded Documents</h3>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:scale-[1.01] transition-transform"><Upload size={13} /> Upload</button>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No documents uploaded</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {documents.map((d: any) => (
                <div key={d.id} onClick={function() { openDetail(d) }} className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:shadow-sm transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${docTypeColor(d.document_type)}`}>{d.document_type.replace('_', ' ')}</span>
                    <button onClick={function(e) { e.stopPropagation(); setConfirmDelete(d) }} className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
                  </div>
                  {d.file_path && isImageExt(d.file_name) ? (
                    <div className="relative mb-2" onClick={function(e) { e.stopPropagation(); setFullscreenImg("/api/documents/" + d.file_path) }}>
                      <img src={"/api/documents/" + d.file_path} alt={d.file_name} className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 truncate">{d.file_name}</span>
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
        </div>
      )}

      {/* Tab: History */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Modification History</h3>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No modification history recorded</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {log.action === 'UPDATE' ? <Edit2 size={13} className="text-primary" /> : log.action === 'CREATE' ? <User size={13} className="text-emerald-500" /> : <Trash2 size={13} className="text-rose-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700 uppercase">{log.action}</span>
                      <span className="text-xs text-slate-400">{log.table_name}</span>
                      <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {log.new_data && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {log.action === 'UPDATE' && log.old_data ? Object.keys(log.new_data).filter((k) => log.old_data[k] !== log.new_data[k]).map((k) => `${k}: ${log.old_data[k] || '—'} → ${log.new_data[k] || '—'}`).join(', ') : JSON.stringify(log.new_data).slice(0, 200)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!saving) setShowEdit(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><Edit2 size={18} className="inline text-primary mr-2" />Edit Patient</h2>
              <button onClick={() => setShowEdit(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><p className="text-sm font-semibold text-slate-800">{patient.full_name}</p><p className="text-xs text-slate-400">{patient.hospital_number}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Full Name *</label>
                  <input type="text" value={editForm.full_name} onChange={(e) => setEditForm((p: any) => ({ ...p, full_name: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth</label>
                  <input type="date" value={editForm.dob} onChange={(e) => setEditForm((p: any) => ({ ...p, dob: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Sex</label>
                  <select value={editForm.sex} onChange={(e) => setEditForm((p: any) => ({ ...p, sex: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                  <select value={editForm.marital_status} onChange={(e) => setEditForm((p: any) => ({ ...p, marital_status: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option value="Single">Single</option><option value="Married">Married</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nationality</label>
                  <input type="text" value={editForm.nationality} onChange={(e) => setEditForm((p: any) => ({ ...p, nationality: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                  <input type="text" value={editForm.occupation} onChange={(e) => setEditForm((p: any) => ({ ...p, occupation: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm((p: any) => ({ ...p, phone: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                  <input type="email" value={editForm.email} onChange={(e) => setEditForm((p: any) => ({ ...p, email: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                  <textarea rows={2} value={editForm.address} onChange={(e) => setEditForm((p: any) => ({ ...p, address: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin</label>
                  <input type="text" value={editForm.next_of_kin} onChange={(e) => setEditForm((p: any) => ({ ...p, next_of_kin: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact</label>
                  <input type="text" value={editForm.emergency_contact_name} onChange={(e) => setEditForm((p: any) => ({ ...p, emergency_contact_name: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone</label>
                  <input type="text" value={editForm.emergency_contact_phone} onChange={(e) => setEditForm((p: any) => ({ ...p, emergency_contact_phone: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Blood Type</label>
                  <select value={editForm.blood_type} onChange={(e) => setEditForm((p: any) => ({ ...p, blood_type: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option>
                    <option value="AB+">AB+</option><option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Insurance</label>
                  <input type="text" value={editForm.insurance} onChange={(e) => setEditForm((p: any) => ({ ...p, insurance: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving || !editForm.full_name?.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!uploading) setShowUpload(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800"><Upload size={18} className="inline text-primary mr-2" />Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Document Type *</label>
                <select value={uploadForm.document_type} onChange={(e) => setUploadForm((p) => ({ ...p, document_type: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select type...</option><option value="id_card">ID Card / Passport</option><option value="insurance">Insurance Card</option>
                  <option value="lab_report">Lab Report</option><option value="referral">Referral Letter</option><option value="consent">Consent Form</option>
                  <option value="prescription">Prescription</option><option value="other">Other</option></select></div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">File</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500">
                    <Upload size={16} />
                    {selectedFile ? selectedFile.name : "Browse files..."}
                    <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" />
                  </label>
                </div>
                {previewUrl && (
                  <div className="mt-2">
                    <div className="relative group inline-block">
                      <img src={previewUrl} alt="Preview" className="h-32 w-auto rounded-xl border border-slate-200 object-cover cursor-pointer" onClick={() => setFullscreenImg(previewUrl)} />
                      <button onClick={() => setFullscreenImg(previewUrl)}
                        className="absolute top-2 right-2 p-1 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={12} /></button>
                    </div>
                  </div>
                )}
              </div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} placeholder="Optional notes..." value={uploadForm.notes}
                  onChange={(e) => setUploadForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={() => setShowUpload(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !uploadForm.document_type || !selectedFile}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload</button>
            </div>
          </div>
        </div>
      )}
      {fullscreenImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setFullscreenImg(null)}>
          <img src={fullscreenImg} alt="Full preview" className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" onClick={() => setFullscreenImg(null)} />
          <button onClick={() => setFullscreenImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
