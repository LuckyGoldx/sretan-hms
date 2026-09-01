import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, X, CheckCheck, Loader2, Building2, Stethoscope, CheckCircle, XCircle, AlertTriangle, User } from 'lucide-react'
import api from '../hooks/useAxios'

interface NotificationItem {
  id: string
  type: string
  title: string
  message?: string
  patient_id?: string | null
  patient_name?: string | null
  hospital_number?: string | null
  ref_table?: string
  ref_id?: string
  is_read: boolean
  created_at: string
}

interface NotificationBellProps {
  staffId?: string | null
}

const TYPE_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  referral_created: { icon: Stethoscope, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  referral_accepted: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-100' },
  referral_completed: { icon: CheckCheck, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  referral_rejected: { icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-100' },
  referral_cancelled: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
}

export default function NotificationBell({ staffId }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    if (!staffId) return
    try {
      const [listRes, countRes] = await Promise.all([
        api.get('/notifications', { params: { recipient_id: staffId } }).catch(() => ({ data: [] })),
        api.get('/notifications/unread-count', { params: { recipient_id: staffId } }).catch(() => ({ data: { unread: 0 } })),
      ])
      setItems(listRes.data || [])
      setUnread(countRes.data?.unread || 0)
    } catch {}
  }, [staffId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markAllRead() {
    if (!staffId) return
    setMarkingAll(true)
    try {
      await api.put('/notifications/mark-all-read', { recipient_id: staffId })
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnread(0)
    } catch {}
    finally { setMarkingAll(false) }
  }

  async function openNotification(n: NotificationItem) {
    // mark single read
    try {
      await api.put('/notifications/mark-read', { ids: [n.id], recipient_id: staffId })
      setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x))
      setUnread((u) => Math.max(0, u - 1))
    } catch {}
    setOpen(false)

    // Route by notification type to the most useful destination
    const refId = n.ref_id || ''
    switch (n.type) {
      case 'referral_created':
        // The patient appears in the department's referred-patients queue
        window.location.href = '/consultant/patients'
        return
      case 'referral_completed':
        // Open the patient chart referrals tab and auto-open the consultation report
        window.location.href = n.patient_id
          ? `/patient/${n.patient_id}?tab=referrals&report=${refId}`
          : '/referrals'
        return
      case 'referral_accepted':
      case 'referral_rejected':
      case 'referral_cancelled':
        // Referring doctor sees the referral in the patient chart referrals tab
        window.location.href = n.patient_id
          ? `/patient/${n.patient_id}?tab=referrals`
          : '/referrals'
        return
      default:
        if (n.patient_id) {
          window.location.href = `/patient/${n.patient_id}`
        }
        return
    }
  }

  function formatTime(ts: string) {
    try {
      return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-500" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full bottom-0 ml-2 w-80 max-w-[85vw] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[90] origin-bottom-left">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            <div className="flex items-center gap-1">
              {items.some((n) => !n.is_read) && (
                <button
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                >
                  {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />} Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">No notifications</p>
              </div>
            ) : (
              items.map((n) => {
                const style = TYPE_STYLES[n.type] || { icon: Bell, color: 'text-slate-500', bg: 'bg-slate-100' }
                const Icon = style.icon
                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 ${n.is_read ? 'opacity-60' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-xl ${style.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${style.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {n.message && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 flex-wrap">
                        <span>{formatTime(n.created_at)}</span>
                        {n.patient_name && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" /> {n.patient_name}
                          </span>
                        )}
                      </div>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-2" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
