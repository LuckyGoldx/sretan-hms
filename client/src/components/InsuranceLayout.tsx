import { useState } from 'react'
import { Menu } from 'lucide-react'
import InsuranceSidebar from './InsuranceSidebar'

export default function InsuranceLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <InsuranceSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-20 lg:hidden p-2 rounded-xl bg-white border border-slate-200 shadow-sm hover:bg-slate-50"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>
      <main className="flex-1 p-4 lg:ml-64 lg:p-6 pt-16 lg:pt-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
