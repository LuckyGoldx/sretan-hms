import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../hooks/useAxios'
import {
  ArrowLeft, User, FileText, Clock, Edit2, Upload, Trash2, X, Loader2, Save,
  Calendar, Shield, Phone, Mail, MapPin, Heart, Briefcase, Globe, Users, Activity, Maximize2, Plus, AlertTriangle,
} from 'lucide-react'
import { COUNTRIES, NIGERIA_STATES, NIGERIA_LGAS, OCCUPATIONS, RELATIONSHIPS } from '../data/formData'
import SearchableSelect from './SearchableSelect'
import { compressImage } from '../utils/compressImage'
import { validatePhone } from '../utils/validatePhone'

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
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [phoneErrors, setPhoneErrors] = useState<Record<string, string>>({})
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ document_type: '', file_name: '', notes: '' })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null)
  const [detailDoc, setDetailDoc] = useState<any | null>(null)
  const [detailEditName, setDetailEditName] = useState('')
  const [detailEditNotes, setDetailEditNotes] = useState('')
  const [savingDetail, setSavingDetail] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [customTypes, setCustomTypes] = useState<any[]>([])
  const [insuranceProviders, setInsuranceProviders] = useState<any[]>([])
  const [editPolicies, setEditPolicies] = useState<any[]>([])
  const [editPolicyForm, setEditPolicyForm] = useState({ provider_id: '', policy_number: '', coverage_type: 'primary', co_pay_percentage: '', start_date: '', end_date: '' })
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [policySaving, setPolicySaving] = useState(false)
  const [policyFormErrors, setPolicyFormErrors] = useState<Record<string, string>>({})
  const [historyDetail, setHistoryDetail] = useState<any | null>(null)
  const [patientPolicies, setPatientPolicies] = useState<any[]>([])
  const editBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { const u = localStorage.getItem('sretan_user'); if (u) setCurrentUser(JSON.parse(u)) } catch {}
    loadData()
  }, [])

  useEffect(() => {
    if (Object.keys(editErrors).length > 0 && editBodyRef.current) {
      var parent = editBodyRef.current.parentElement || editBodyRef.current
      if (parent) { parent.scrollTo({ top: 0 }); parent.scrollTop = 0 }
    }
  }, [editErrors])

  const isAdmin = currentUser?.role === 'Admin'

  async function loadData() {
    setLoading(true)
    try {
      const [patRes, docRes, auditRes, insRes, provRes] = await Promise.all([
        api.get(`/patients/${patientId}`).catch(() => ({ data: null })),
        api.get(`/patients/${patientId}/documents`).catch(() => ({ data: [] })),
        api.get(`/patients/${patientId}/audit`).catch(() => ({ data: [] })),
        api.get('/insurance-types').catch(() => ({ data: [] })),
        api.get('/insurance/providers').catch(() => ({ data: [] })),
      ])
      setPatient(patRes.data || null)
      setDocuments(docRes.data || [])
      setAuditLogs(auditRes.data || [])
      setCustomTypes(insRes.data || [])
      setInsuranceProviders(Array.isArray(provRes.data) ? provRes.data : [])
      // Fetch patient policies for insurance display
      try {
        const polRes = await api.get(`/insurance/policies/${patientId}`).catch(() => ({ data: [] }))
        setPatientPolicies(Array.isArray(polRes.data) ? polRes.data : [])
      } catch { setPatientPolicies([]) }
    } catch {} finally { setLoading(false) }
  }

  function openEdit() {
    if (!patient) return
    setEditErrors({})
    setPhoneErrors({})
    setEditForm({
      full_name: patient.full_name,
      dob: patient.dob ? (() => { var d = new Date(patient.dob); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') })() : '', sex: patient.sex,
      phone: patient.phone || '', email: patient.email || '', address: patient.address || '',
      nationality: patient.nationality || '', state_of_origin: patient.state_of_origin || '',
      lga: patient.lga || '', occupation: patient.occupation || '',
      marital_status: patient.marital_status || '',
      next_of_kin: patient.next_of_kin || '', next_of_kin_phone: patient.next_of_kin_phone || '',
      relationship: patient.relationship || '', next_of_kin_address: patient.next_of_kin_address || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      insurance: patient.insurance || '', insurance_type: patient.insurance_type || '',
      insurance_sub_type: patient.insurance_sub_type || '', blood_type: patient.blood_type || '',
    })
    setShowEdit(true)
    loadPolicies(patientId || '')
  }

  async function loadPolicies(pid: string) {
    try {
      const res = await api.get(`/insurance/policies/${pid}`)
      setEditPolicies(Array.isArray(res.data) ? res.data : [])
    } catch { setEditPolicies([]) }
  }

  async function addPolicyForEdit() {
    const errs: Record<string, string> = {}
    if (!editPolicyForm.provider_id) errs.provider_id = 'Required'
    if (!editPolicyForm.policy_number?.trim()) errs.policy_number = 'Required'
    if (!editPolicyForm.coverage_type) errs.coverage_type = 'Required'
    if (Object.keys(errs).length > 0) { setPolicyFormErrors(errs); return }
    setPolicyFormErrors({})
    setPolicySaving(true)
    try {
      await api.post('/insurance/policies', { ...editPolicyForm, patient_id: patientId || '', co_pay_percentage: editPolicyForm.co_pay_percentage ? parseFloat(editPolicyForm.co_pay_percentage) : undefined, start_date: editPolicyForm.start_date || null, end_date: editPolicyForm.end_date || null })
      setEditPolicyForm({ provider_id: '', policy_number: '', coverage_type: 'primary', co_pay_percentage: '', start_date: '', end_date: '' })
      setShowPolicyForm(false)
      await loadPolicies(patientId || '')
    } catch (err: any) { alert(err.response?.data?.message || 'Failed to add policy') }
    finally { setPolicySaving(false) }
  }

  async function removePolicyFromEdit(policyId: string) {
    try {
      await api.put(`/insurance/policies/${policyId}`, { is_active: false, co_pay_percentage: 0 })
      setConfirmDelete(null)
      await loadPolicies(patientId || '')
    } catch {}
  }

  function validateEdit() {
    var e: Record<string, string> = {}
    if (!editForm.full_name?.trim()) e.full_name = 'Full name is required'
    if (!editForm.dob) e.dob = 'Date of birth is required'
    if (!editForm.sex) e.sex = 'Sex is required'
    if (!editForm.nationality) e.nationality = 'Nationality is required'
    if (editForm.nationality === 'Nigeria' && !editForm.state_of_origin) e.state_of_origin = 'State of origin is required for Nigeria'
    if (!editForm.phone?.trim()) { e.phone = 'Phone is required' } else { var pv = validatePhone(editForm.phone); if (!pv.valid) e.phone = pv.error || 'Invalid phone' }
    if (!editForm.blood_type) e.blood_type = 'Blood type is required'
    if (!editForm.emergency_contact_name?.trim()) e.emergency_contact_name = 'Emergency contact is required'
    if (!editForm.emergency_contact_phone?.trim()) { e.emergency_contact_phone = 'Emergency phone is required' } else { var epv = validatePhone(editForm.emergency_contact_phone); if (!epv.valid) e.emergency_contact_phone = epv.error || 'Invalid phone' }
    setEditErrors(e)
    if (Object.keys(e).length > 0 && editBodyRef.current) {
      var scrollEl = editBodyRef.current.parentElement || editBodyRef.current
      setTimeout(function() {
        if (scrollEl) {
          scrollEl.scrollTo({ top: 0 })
          scrollEl.scrollTop = 0
        }
      }, 50)
    }
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!patient || !validateEdit()) return
    setSaving(true)
    try {
      const res = await api.put(`/patients/${patient.id}`, { ...editForm, edited_by: currentUser?.id })
      setPatient((prev: any) => ({ ...prev, ...res.data }))
      setShowEdit(false)
      setEditErrors({})
      loadData()
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save. Please try again.'
      alert(msg)
      console.error('Save error:', err)
    } finally { setSaving(false) }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0]!
    if (!file) return
    var compressed = await compressImage(file)
    setSelectedFile(compressed)
    setUploadForm((p: any) => ({ ...p, file_name: compressed.name }))
    if (compressed.type.startsWith('image/')) {
      var reader = new FileReader()
      reader.onload = function(ev: any) { setPreviewUrl(ev.target?.result as string) }
      reader.readAsDataURL(compressed)
    } else { setPreviewUrl(null) }
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
      setShowUpload(false); setSelectedFile(null); setPreviewUrl(null)
      setUploadForm({ document_type: '', file_name: '', notes: '' })
      loadData()
    } catch {} finally { setUploading(false) }
  }

  function openDetail(doc: any) { setDetailDoc(doc); setDetailEditName(doc.file_name); setDetailEditNotes(doc.notes || '') }

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
      setDetailDoc((prev: any) => prev ? { ...prev, file_name: detailEditName, notes: detailEditNotes } : null)
    } catch {} finally { setSavingDetail(false) }
  }

  const docTypeColor = (t: string) => {
    var map: Record<string, string> = {
      id_card: 'bg-blue-100 text-blue-700', insurance: 'bg-emerald-100 text-emerald-700',
      lab_report: 'bg-purple-100 text-purple-700', referral: 'bg-amber-100 text-amber-700',
      consent: 'bg-rose-100 text-rose-700', prescription: 'bg-indigo-100 text-indigo-700',
      other: 'bg-slate-100 text-slate-600',
    }
    return map[t] || 'bg-slate-100 text-slate-600'
  }

  const isImageExt = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)
  const Req = () => <span className="text-rose-500 ml-0.5">*</span>

  function calcAge(dob: any): string {
    if (!dob) return ''
    try {
      var bd = new Date(dob), today = new Date()
      var age = today.getFullYear() - bd.getFullYear()
      var m = today.getMonth() - bd.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--
      return age + ' years'
    } catch { return '' }
  }

  const getEditState = () => {
    var nat = editForm.nationality
    var states = nat === 'Nigeria' ? NIGERIA_STATES : []
    var lgas = editForm.state_of_origin && NIGERIA_LGAS[editForm.state_of_origin] ? NIGERIA_LGAS[editForm.state_of_origin] : []
    return { states, lgas, nat }
  }

  function fmtVal(v: any, k: string): string {
    if (!v || v === null || v === 'null') return '—';
    if (['dob','created_at','updated_at','last_synced_at','administered_at','discharged_at','admitted_at','end_date'].includes(k)) {
      try { return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch(e) {}
    }
    return String(v);
  }

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'demographics', label: 'Demographics', icon: User },
    { id: 'documents', label: `Documents (${documents.length})`, icon: FileText },
    { id: 'history', label: `Edit History (${auditLogs.length})`, icon: Clock },
  ]

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={32} className="animate-spin text-primary" /></div>
  if (!patient) return <div className="flex items-center justify-center min-h-[60vh] text-slate-400"><p>Patient not found</p></div>

  var es = getEditState()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/records/patients')} className="p-2 rounded-xl hover:bg-slate-100"><ArrowLeft size={20} className="text-slate-500" /></button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-800">{patient.full_name}</h1>
              {patient.primary_provider && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium">
                  <Shield size={10} /> {patient.primary_provider}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${patient.status === 'checked_in' ? 'bg-blue-100 text-blue-700' : patient.status === 'in_triage' ? 'bg-amber-100 text-amber-700' : patient.status === 'waiting' ? 'bg-purple-100 text-purple-700' : patient.status === 'with_doctor' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                {patient.status?.replace('_', ' ') || 'Unknown'}</span>
            </div>
            <p className="text-sm text-slate-400">{patient.hospital_number} &middot; {patient.sex} &middot; DOB: {patient.dob?.slice(0, 10)} &middot; Age: {calcAge(patient.dob)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Registered {new Date(patient.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openEdit} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform"><Edit2 size={15} /> Edit</button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"><Upload size={15} /> Upload</button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {tabs.map((t) => {
          var Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              <Icon size={14} /> {t.label}</button>
          )
        })}
      </div>

      {tab === 'demographics' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Personal Information</h3>
              <div className="space-y-3">
                {[
                  { icon: User, label: 'Full Name', value: patient.full_name },
                  { icon: Calendar, label: 'Date of Birth', value: (patient.dob?.slice(0, 10) || '—') + (patient.dob ? ' (' + calcAge(patient.dob) + ')' : '') },
                  { icon: Users, label: 'Sex', value: patient.sex || '—' },
                  { icon: Heart, label: 'Marital Status', value: patient.marital_status || '—' },
                  { icon: Globe, label: 'Nationality', value: patient.nationality || '—' },
                  { icon: Globe, label: 'State of Origin', value: patient.state_of_origin || '—' },
                  { icon: Globe, label: 'LGA', value: patient.lga || '—' },
                  { icon: Briefcase, label: 'Occupation', value: patient.occupation || '—' },
                  { icon: Activity, label: 'Blood Type', value: patient.blood_type || '—' },
                ].map((f) => {
                  var Icon = f.icon
                  return (<div key={f.label} className="flex items-center gap-3"><Icon size={14} className="text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span><span className="text-sm font-medium text-slate-800 truncate">{f.value}</span></div>)
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
                  var Icon = f.icon
                  return (<div key={f.label} className="flex items-center gap-3"><Icon size={14} className="text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span><span className="text-sm font-medium text-slate-800 truncate">{f.value}</span></div>)
                })}
              </div>
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency</h3>
                <div className="space-y-3">
                  {[
                    { icon: Users, label: 'Next of Kin', value: patient.next_of_kin || '—' },
                    { icon: Phone, label: 'Next of Kin Phone', value: patient.next_of_kin_phone || '—' },
                    { icon: Users, label: 'Relationship', value: patient.relationship || '—' },
                    { icon: MapPin, label: 'Next of Kin Address', value: patient.next_of_kin_address || '—' },
                    { icon: User, label: 'Emergency Contact', value: patient.emergency_contact_name || '—' },
                    { icon: Phone, label: 'Emergency Phone', value: patient.emergency_contact_phone || '—' },
                    { icon: Shield, label: 'Insurance', value: (() => {
                      const primary = patientPolicies?.find((p: any) => p.coverage_type === 'primary' && p.policy_status === 'active')
                      if (primary) return primary.provider_name + ' (Primary)'
                      return patient.insurance_type ? patient.insurance_type + (patient.insurance && patient.insurance !== '__other__' ? ' (' + patient.insurance + ')' : '') : patient.insurance || '—'
                    })() },
                  ].map((f) => {
                    var Icon = f.icon
                    return (<div key={f.label} className="flex items-center gap-3"><Icon size={14} className="text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}</span><span className="text-sm font-medium text-slate-800 truncate">{f.value}</span></div>)
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Uploaded Documents</h3>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:scale-[1.01]"><Upload size={13} /> Upload</button>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No documents uploaded</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {documents.map((d: any) => (
                <div key={d.id} onClick={function() { openDetail(d) }} className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:shadow-sm transition-shadow cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${docTypeColor(d.document_type)}`}>{d.document_type.replace('_', ' ')}</span>
                    <button onClick={function(e: any) { e.stopPropagation(); setConfirmDelete(d) }} className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
                  </div>
                  {d.file_path && isImageExt(d.file_name) ? (
                    <div className="relative mb-2 cursor-pointer" onClick={function(e: any) { e.stopPropagation(); setFullscreenImg("/api/documents/" + d.file_path) }}>
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

      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Modification History</h3>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No modification history recorded</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div key={log.id} onClick={function() { setHistoryDetail(log) }} className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:shadow-sm transition-shadow">
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
                        {log.action === 'UPDATE' ? Object.keys(log.new_data).filter(function(k) { return !["id","tenant_id","is_synced","last_synced_at","hospital_number","updated_at"].includes(k); }).filter(function(k) { return String((log.old_data || {})[k] || "") !== String(log.new_data[k] || ""); }).slice(0, 5).map(function(k) { return k.replace(/_/g, " "); }).join(', ') : ''}
                      </p>
                    )}
                    {log.performed_by_name && <p className="text-[10px] text-slate-400 mt-1">by {log.performed_by_name}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* History Detail Modal */}
      {historyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={function() { setHistoryDetail(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4" onClick={function(e: any) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800"><Clock size={18} className="inline text-primary mr-2" />Change Details</h2>
              <button onClick={function() { setHistoryDetail(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">Action</span><p className="font-medium text-slate-800 capitalize">{historyDetail.action?.toLowerCase()}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">Section</span><p className="font-medium text-slate-800">{historyDetail.table_name}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">Date & Time</span><p className="font-medium text-slate-800">{new Date(historyDetail.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
                {historyDetail.performed_by_name && <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">By</span><p className="font-medium text-slate-800">{historyDetail.performed_by_name}</p></div>}
              </div>
              {historyDetail.new_data && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Changes Made</h3>
                  <div className="space-y-2">
                    {Object.entries(historyDetail.new_data).map(function(entry) {
                      var key = entry[0]; var newVal = entry[1]; var oldVal = (historyDetail.old_data || {})[key];
                      if (String(oldVal || "") === String(newVal || "")) return null;
                      if (["id","tenant_id","is_synced","last_synced_at","hospital_number","updated_at"].includes(key)) return null;
                      return (
                        <div key={key} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs font-medium text-slate-500 capitalize mb-1">{key.replace(/_/g, " ")}</p>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <span className="text-rose-600 line-through">{fmtVal(oldVal, key)}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-emerald-600 font-medium">{fmtVal(newVal, key)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end">
              <button onClick={function() { setHistoryDetail(null) }} className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={function() { if (!saving) setShowEdit(false) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={function(e: any) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-base font-semibold text-slate-800"><Edit2 size={18} className="inline text-primary mr-2" />Edit Patient</h2>
              <button onClick={function() { setShowEdit(false) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5" ref={editBodyRef}>
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
                <div><p className="text-sm font-semibold text-slate-800">{patient.full_name}</p><p className="text-xs text-slate-400">{patient.hospital_number}</p></div>
              </div>

              {Object.keys(editErrors).length > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                  <p className="font-medium mb-1">Please fix the following errors:</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    {Object.entries(editErrors).map(function(e) { return <li key={e[0]}>{e[1]}</li> })}
                  </ul>
                </div>
              )}

              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Full Name<Req /></label>
                  <input type="text" value={editForm.full_name || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, full_name: e.target.value })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.full_name; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.full_name ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                  {editErrors.full_name && <p className="text-xs text-rose-500 mt-1">{editErrors.full_name}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth<Req /></label>
                  <input type="date" value={editForm.dob || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, dob: e.target.value })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.dob; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.dob ? 'border-rose-300 bg-rose-50' : 'border-slate-200')} />
                  {editErrors.dob && <p className="text-xs text-rose-500 mt-1">{editErrors.dob}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Sex<Req /></label>
                  <select value={editForm.sex || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, sex: e.target.value })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.sex; return n }) }}
                    className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.sex ? 'border-rose-300 bg-rose-50' : 'border-slate-200')}>
                    <option value="">Select...</option><option>Male</option><option>Female</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Marital Status</label>
                  <select value={editForm.marital_status || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, marital_status: e.target.value })) }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Occupation</label>
                  <SearchableSelect value={editForm.occupation || ''} onChange={function(v: string) { setEditForm((p: any) => ({ ...p, occupation: v })) }} options={OCCUPATIONS} placeholder="Search occupation..." /></div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">Nationality<Req /></label>
                  <SearchableSelect value={editForm.nationality || ''} onChange={function(v: string) { setEditForm((p: any) => ({ ...p, nationality: v, state_of_origin: '', lga: '' })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.nationality; return n }) }} options={COUNTRIES} placeholder="Search country..." />
                  {editErrors.nationality && <p className="text-xs text-rose-500 mt-1">{editErrors.nationality}</p>}</div>
                <div><label className="block text-xs font-medium text-slate-500 mb-1">State of Origin{editForm.nationality === 'Nigeria' ? <Req /> : ''}</label>
                  {editForm.nationality === 'Nigeria' ? (
                    <SearchableSelect value={editForm.state_of_origin || ''} onChange={function(v: string) { setEditForm((p: any) => ({ ...p, state_of_origin: v, lga: '' })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.state_of_origin; return n }) }} options={es.states} placeholder="Search state..." />
                  ) : (
                    <input type="text" placeholder="Enter state/province" value={editForm.state_of_origin || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, state_of_origin: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />)}
                  {editErrors.state_of_origin && <p className="text-xs text-rose-500 mt-1">{editErrors.state_of_origin}</p>}
                </div>
              </div>
              {editForm.state_of_origin && editForm.nationality === 'Nigeria' && (
                <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA</label>
                  <SearchableSelect value={editForm.lga || ''} onChange={function(v: string) { setEditForm((p: any) => ({ ...p, lga: v })) }} options={es.lgas} placeholder="Search LGA..." /></div>
              )}
              {editForm.state_of_origin && editForm.nationality !== 'Nigeria' && (
                <div><label className="block text-xs font-medium text-slate-500 mb-1">LGA / District</label>
                  <input type="text" placeholder="Enter LGA" value={editForm.lga || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, lga: e.target.value })) }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
              )}

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Phone<Req /></label>
                    <input type="text" value={editForm.phone || ''} onChange={function(e: any) { var v = e.target.value.replace(/[^0-9+]/g, ''); setEditForm((p: any) => ({ ...p, phone: v })); if (v && !validatePhone(v).valid) setPhoneErrors(function(p2: any) { return { ...p2, phone: validatePhone(v).error } }); else setPhoneErrors(function(p2: any) { var n = { ...p2 }; delete n.phone; return n }); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.phone; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.phone || phoneErrors.phone ? "border-rose-300 bg-rose-50" : "border-slate-200")} />
                  {(editErrors.phone || phoneErrors.phone) && <p className="text-xs text-rose-500 mt-1">{phoneErrors.phone || editErrors.phone}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                    <input type="email" value={editForm.email || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, email: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div className="col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                    <textarea rows={2} value={editForm.address || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, address: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Next of Kin / Emergency</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
                    <input type="text" value={editForm.next_of_kin || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, next_of_kin: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Relationship</label>
                    <SearchableSelect value={editForm.relationship || ''} onChange={function(v: string) { setEditForm((p: any) => ({ ...p, relationship: v })) }} options={RELATIONSHIPS} placeholder="Select relationship..." /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Phone</label>
                    <input type="text" value={editForm.next_of_kin_phone || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, next_of_kin_phone: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Next of Kin Address</label>
                    <textarea rows={2} value={editForm.next_of_kin_address || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, next_of_kin_address: e.target.value })) }}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Contact<Req /></label>
                    <input type="text" value={editForm.emergency_contact_name || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, emergency_contact_name: e.target.value })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.emergency_contact_name; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.emergency_contact_name ? "border-rose-300 bg-rose-50" : "border-slate-200")} />
                  {editErrors.emergency_contact_name && <p className="text-xs text-rose-500 mt-1">{editErrors.emergency_contact_name}</p>}</div>
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Emergency Phone<Req /></label>
                    <input type="text" value={editForm.emergency_contact_phone || ''} onChange={function(e: any) { var v = e.target.value.replace(/[^0-9+]/g, ''); setEditForm((p: any) => ({ ...p, emergency_contact_phone: v })); if (v && !validatePhone(v).valid) setPhoneErrors(function(p2: any) { return { ...p2, emergency_contact_phone: validatePhone(v).error } }); else setPhoneErrors(function(p2: any) { var n = { ...p2 }; delete n.emergency_contact_phone; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.emergency_contact_phone || phoneErrors.emergency_contact_phone ? "border-rose-300 bg-rose-50" : "border-slate-200")} />
                  {(editErrors.emergency_contact_phone || phoneErrors.emergency_contact_phone) && <p className="text-xs text-rose-500 mt-1">{phoneErrors.emergency_contact_phone || editErrors.emergency_contact_phone}</p>}</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Medical</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-slate-500 mb-1">Blood Type<Req /></label>
                    <select value={editForm.blood_type || ''} onChange={function(e: any) { setEditForm((p: any) => ({ ...p, blood_type: e.target.value })); setEditErrors(function(prev: any) { var n = { ...prev }; delete n.blood_type; return n }) }}
                      className={"w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none " + (editErrors.blood_type ? "border-rose-300 bg-rose-50" : "border-slate-200")}>
                      <option value="">Select...</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></div>
                      {/* Unified Insurance Section */}
                  <div className="col-span-2 mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield size={13} /> Insurance Policies
                      </h3>
                      {!showPolicyForm && (
                        <button onClick={() => {
                          setShowPolicyForm(true)
                          setPolicyFormErrors({})
                          setEditPolicyForm(p => ({ ...p, provider_id: editForm.insurance_type ? insuranceProviders.find(pr => pr.name === editForm.insurance_type)?.id || '' : '', policy_number: '', coverage_type: editPolicies.some(pol => pol.coverage_type === 'primary' && pol.is_active) ? 'secondary' : 'primary', co_pay_percentage: '', start_date: '', end_date: '' }))
                        }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-all">
                          <Plus size={13} /> {editPolicies.some(pol => pol.coverage_type === 'primary' && pol.is_active) ? 'Add Secondary' : 'Add Insurance'}
                        </button>
                      )}
                    </div>

                    {editPolicies.filter((p: any) => p.policy_status !== 'deactivated' || p.is_active).length > 0 && (
                      <div className="space-y-2 mb-3">
                        {editPolicies.filter((p: any) => p.policy_status !== 'deactivated' || p.is_active).map((pol: any) => (
                          <div key={pol.id} className={`relative rounded-xl border p-3 pr-10 transition-all ${pol.policy_status === 'active' ? 'border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-white' : pol.policy_status === 'expired' ? 'border-amber-200 bg-gradient-to-r from-amber-50/50 to-white' : 'border-slate-200 bg-slate-50'}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${pol.policy_status === 'active' ? 'bg-emerald-100' : pol.policy_status === 'expired' ? 'bg-amber-100' : 'bg-slate-200'}`}>
                                <Shield size={13} className={pol.policy_status === 'active' ? 'text-emerald-600' : pol.policy_status === 'expired' ? 'text-amber-600' : 'text-slate-500'} />
                              </div>
                              <span className="text-sm font-semibold text-slate-800">{pol.provider_name}</span>
                              <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${pol.coverage_type === 'primary' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {pol.coverage_type === 'primary' ? '● Primary' : '○ Secondary'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs ml-9">
                              {pol.policy_number && <p><span className="text-slate-400">Policy:</span> <span className="font-mono font-medium text-slate-700">{pol.policy_number}</span></p>}
                              <p><span className="text-slate-400">Status:</span><span className={`ml-1 font-medium ${pol.policy_status === 'active' ? 'text-emerald-600' : pol.policy_status === 'expired' ? 'text-amber-600' : 'text-rose-600'}`}>{pol.policy_status}</span></p>
                              {(pol.start_date || pol.end_date) && <p className="col-span-2"><span className="text-slate-400">Valid:</span> <span className="font-medium text-slate-600">{pol.start_date || '—'} → {pol.end_date || 'Ongoing'}</span></p>}
                              {(pol.co_pay_percentage > 0) && <p><span className="text-slate-400">Co-pay:</span> <span className="font-medium text-slate-600">{pol.co_pay_percentage}%</span></p>}
                            </div>
                            <button onClick={() => { setConfirmDelete(pol); setConfirmDeleteStep(1) }} className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-all">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showPolicyForm && (
                      <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-xl border border-slate-200 p-4 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Insurance Provider</label>
                          <select value={editPolicyForm.provider_id} onChange={e => {
                            const prov = insuranceProviders.find((p: any) => p.id === e.target.value)
                            setEditPolicyForm(p => ({ ...p, provider_id: e.target.value }))
                            if (prov) setEditForm((p: any) => ({ ...p, insurance_type: prov.name, insurance: prov.category || 'Other', insurance_sub_type: prov.name }))
                          }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all">
                            <option value="">Choose provider...</option>
                            {insuranceProviders
                              .filter((p: any) => p.is_active)
                              .filter((p: any) => {
                                const oppositeType = editPolicyForm.coverage_type === 'primary' ? 'secondary' : 'primary'
                                const used = editPolicies.find((pol: any) => pol.provider_id === p.id && pol.is_active && pol.coverage_type === oppositeType)
                                return !used
                              })
                              .map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                          </select>
                          {editPolicyForm.provider_id && (() => {
                            const p = insuranceProviders.find(pr => pr.id === editPolicyForm.provider_id)
                            return p && <p className="text-xs text-slate-400 mt-1.5">Category: <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">{p.category || 'Other'}</span></p>
                          })()}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Policy / Insurance Number</label>
                          <input type="text" value={editPolicyForm.policy_number} onChange={e => setEditPolicyForm(p => ({ ...p, policy_number: e.target.value }))}
                            placeholder="e.g. GPH-78901" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Coverage Type</label>
                            <select value={editPolicyForm.coverage_type} onChange={e => setEditPolicyForm(p => ({ ...p, coverage_type: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                              <option value="primary">Primary</option>
                              <option value="secondary">Secondary</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Co-pay %</label>
                            <input type="number" min="0" max="100" value={editPolicyForm.co_pay_percentage}
                              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 0 && v <= 100) setEditPolicyForm(p => ({ ...p, co_pay_percentage: e.target.value })); else if (e.target.value === '') setEditPolicyForm(p => ({ ...p, co_pay_percentage: '' })) }}
                              placeholder="Inherited" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                            <p className="text-[10px] text-slate-400 mt-1">Patient's out-of-pocket %. Blank = inherited from provider.</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Valid From</label>
                            <input type="date" value={editPolicyForm.start_date} onChange={e => setEditPolicyForm(p => ({ ...p, start_date: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Valid Until</label>
                            <input type="date" value={editPolicyForm.end_date} onChange={e => setEditPolicyForm(p => ({ ...p, end_date: e.target.value }))}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={addPolicyForEdit} disabled={policySaving}
                            className="flex-1 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all">
                            {policySaving ? 'Saving...' : 'Save Policy'}
                          </button>
                          <button onClick={() => setShowPolicyForm(false)}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white rounded-xl border border-slate-200 transition-all">Cancel</button>
                        </div>
                      </div>
                    )}

                    {editPolicies.filter((p: any) => p.is_active).length === 0 && !showPolicyForm && (
                      <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <Shield size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-xs text-slate-400">No insurance policies on file</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Add a policy to link this patient with an insurance provider</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={function() { setShowEdit(false) }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Policy Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmDelete(null); setConfirmDeleteStep(1) }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 text-center">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 ${confirmDeleteStep === 2 ? 'bg-red-50' : 'bg-rose-50'}`}>
                <AlertTriangle className={`w-7 h-7 ${confirmDeleteStep === 2 ? 'text-red-500' : 'text-rose-500'}`} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                {confirmDeleteStep === 2 ? 'Are you absolutely sure?' : 'Remove Insurance Policy'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{confirmDelete.provider_name} — {confirmDelete.policy_number}</p>
            </div>
            <div className="px-6 pb-4">
              <div className={`rounded-xl p-4 text-sm ${confirmDeleteStep === 2 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                {confirmDeleteStep === 2 ? (
                  <>
                    <p>This will deactivate the policy for <strong>{confirmDelete.provider_name}</strong>. Removing it means:</p>
                    <ul className="list-disc pl-4 mt-2 space-y-1 text-xs">
                      <li>The patient will no longer be linked to <strong>{confirmDelete.provider_name}</strong> for new coverage</li>
                      <li>Policy number and records will be deactivated</li>
                    </ul>
                    <p className="text-xs font-medium mt-3">Existing claims, invoices and settled services are <strong className="text-emerald-600">NOT affected</strong> and remain valid until cleared.</p>
                  </>
                ) : (
                  <>
                    <p>You are about to remove <strong>{confirmDelete.provider_name}</strong> ({confirmDelete.coverage_type}) from this patient.</p>
                    <p className="text-xs text-emerald-600 mt-2">Only the policy is deactivated. Existing claims/invoices remain valid until settled.</p>
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setConfirmDelete(null); setConfirmDeleteStep(1) }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-xl transition-all">Cancel</button>
              {confirmDeleteStep === 1 ? (
                <button onClick={() => setConfirmDeleteStep(2)}
                  className="flex items-center gap-2 px-5 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-all">
                  <X className="w-4 h-4" /> Yes, Remove Policy
                </button>
              ) : (
                <button onClick={() => removePolicyFromEdit(confirmDelete.id)}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-all">
                  <AlertTriangle className="w-4 h-4" /> Yes, Delete Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={function() { if (!uploading) { setShowUpload(false); setSelectedFile(null); setPreviewUrl(null) } }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md mx-4" onClick={function(e: any) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800"><Upload size={18} className="inline text-primary mr-2" />Upload Document</h2>
              <button onClick={function() { setShowUpload(false); setSelectedFile(null); setPreviewUrl(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Document Type *</label>
                <select value={uploadForm.document_type} onChange={function(e: any) { setUploadForm((p: any) => ({ ...p, document_type: e.target.value })) }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select...</option><option value="id_card">ID Card / Passport</option><option value="insurance">Insurance Card</option>
                  <option value="lab_report">Lab Report</option><option value="referral">Referral</option><option value="consent">Consent Form</option>
                  <option value="prescription">Prescription</option><option value="other">Other</option></select></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">File</label>
                <label className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all text-sm text-slate-500">
                  <Upload size={16} /> {selectedFile ? selectedFile.name : 'Browse files...'}
                  <input type="file" className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx" /></label>
              </div>
              {previewUrl && (<div className="relative group inline-block"><img src={previewUrl} alt="Preview" className="h-32 w-auto rounded-xl border border-slate-200 object-cover cursor-pointer" onClick={function() { setFullscreenImg(previewUrl) }} /></div>)}
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} placeholder="Optional..." value={uploadForm.notes} onChange={function(e: any) { setUploadForm((p: any) => ({ ...p, notes: e.target.value })) }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-end gap-3">
              <button onClick={function() { setShowUpload(false); setSelectedFile(null); setPreviewUrl(null) }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !uploadForm.document_type || !selectedFile}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={function() { if (!deleting) setConfirmDelete(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm mx-4" onClick={function(e: any) { e.stopPropagation() }}>
            <div className="px-6 py-5 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-3"><Trash2 size={22} className="text-rose-500" /></div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Delete Document?</h2>
              <p className="text-sm text-slate-500">Are you sure you want to delete <strong>{confirmDelete.file_name}</strong>? This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-center gap-3">
              <button onClick={function() { setConfirmDelete(null) }} disabled={deleting} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-50">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {detailDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={function() { if (!savingDetail) setDetailDoc(null) }}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={function(e: any) { e.stopPropagation() }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800"><FileText size={18} className="inline text-primary mr-2" />Document Details</h2>
              <button onClick={function() { setDetailDoc(null) }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {detailDoc.file_path && isImageExt(detailDoc.file_name) && (
                <div className="relative cursor-pointer" onClick={function() { setFullscreenImg("/api/documents/" + detailDoc.file_path) }}>
                  <img src={"/api/documents/" + detailDoc.file_path} alt={detailDoc.file_name} className="w-full h-48 object-cover rounded-xl border border-slate-200" />
                </div>
              )}
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Document Type</label>
                <span className={"inline-block px-2.5 py-1 rounded-lg text-sm font-medium " + docTypeColor(detailDoc.document_type)}>{detailDoc.document_type.replace("_", " ")}</span></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">File Name</label>
                <input type="text" value={detailEditName} onChange={function(e: any) { setDetailEditName(e.target.value) }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none" /></div>
              <div><label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
                <textarea rows={3} value={detailEditNotes} onChange={function(e: any) { setDetailEditNotes(e.target.value) }}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">File Size</span><p className="font-medium text-slate-700">{detailDoc.file_size ? ((detailDoc.file_size / 1024).toFixed(1) + ' KB') : '—'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">Uploaded</span><p className="font-medium text-slate-700">{new Date(detailDoc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour:'2-digit', minute:'2-digit' })}</p></div>
              </div>
              {detailDoc.uploaded_by_name && (<div className="bg-slate-50 rounded-xl p-3"><span className="text-xs text-slate-400">Uploaded By</span><p className="font-medium text-slate-700">{detailDoc.uploaded_by_name}</p></div>)}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex justify-between">
              <button onClick={function() { setConfirmDelete(detailDoc) }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100"><Trash2 size={14} /> Delete</button>
              <div className="flex gap-3">
                <button onClick={function() { setDetailDoc(null) }} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Close</button>
                {(detailEditName !== detailDoc.file_name || detailEditNotes !== (detailDoc.notes || '')) && (
                  <button onClick={handleDetailSave} disabled={savingDetail}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:scale-[1.01] transition-transform disabled:opacity-50">
                    {savingDetail ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Changes</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image */}
      {fullscreenImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={function() { setFullscreenImg(null) }}>
          <img src={fullscreenImg} alt="Full preview" className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl" />
          <button onClick={function() { setFullscreenImg(null) }} className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"><X size={20} /></button>
        </div>
      )}
    </div>
  )
}
