import { useState, useEffect } from 'react'
import api from '../hooks/useAxios'
import {
  FlaskConical, Search, Loader2, ChevronUp, ChevronDown
} from 'lucide-react'

const AMOUNT_TYPES = ['units', 'mL', 'L', 'mg', 'g', 'tests', 'packs']

type SortKey = 'drug_name' | 'amount_type' | 'price' | 'stock_count'

function buildDesc(item: any): string {
  const parts: string[] = []
  if (item.amount_type === 'tests') parts.push('Test kit/reagent')
  else if (item.amount_type === 'units') parts.push('Laboratory item')
  else if (item.amount_type === 'mL') parts.push('Liquid laboratory item')
  else if (item.amount_type === 'L') parts.push('Bulk liquid item')
  else if (item.amount_type === 'mg' || item.amount_type === 'g') parts.push('Measured laboratory item')
  else if (item.amount_type === 'packs') parts.push('Pack of laboratory items')
  else parts.push('Laboratory item')
  if (item.supplier) parts.push(`Supplier: ${item.supplier}`)
  if (item.batch_number) parts.push(`Batch: ${item.batch_number}`)
  if (item.cost_price) parts.push(`Cost: ₦${Number(item.cost_price).toLocaleString()}`)
  if (item.stock_count <= item.reorder_level) parts.push('LOW STOCK')
  return parts.join(' · ')
}

export default function LabCatalog() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('drug_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    setLoading(true)
    try {
      const res = await api.get('/inventory?category=lab&show_inactive=true')
      setItems(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function sortIcon(k: SortKey) {
    if (sortKey !== k) return null
    return sortDir === 'asc' ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />
  }

  const filtered = items.filter((i: any) =>
    (i.drug_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const sorted = [...filtered].sort((a, b) => {
    const d = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'price' || sortKey === 'stock_count') return (Number(a[sortKey]) - Number(b[sortKey])) * d
    return ((a[sortKey] || '').localeCompare(b[sortKey] || '')) * d
  })

  const totalItems = items.length
  const categoryCount = new Set(items.map((i: any) => i.amount_type).filter(Boolean)).size

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><FlaskConical size={22} className="text-purple-600" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Lab Test Catalog</h1>
            <p className="text-sm text-slate-500">Lab inventory items with selling prices</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-purple-600">{totalItems}</p>
          <p className="text-xs text-slate-500">Total Items</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-2xl font-bold text-sky-600">{categoryCount}</p>
          <p className="text-xs text-slate-500">Types</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" placeholder="Search items by name..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none bg-white" />
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <FlaskConical size={48} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium">No items in catalog</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th onClick={() => toggleSort('drug_name')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Name {sortIcon('drug_name')}</th>
                  <th onClick={() => toggleSort('amount_type')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Type {sortIcon('amount_type')}</th>
                  <th onClick={() => toggleSort('price')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Sell Price (₦) {sortIcon('price')}</th>
                  <th onClick={() => toggleSort('stock_count')} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">Stock {sortIcon('stock_count')}</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((item: any) => {
                  const desc = buildDesc(item)
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-800 whitespace-nowrap">{item.drug_name}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium">{item.amount_type || 'units'}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 font-medium whitespace-nowrap">
                        {item.price ? `₦${Number(item.price).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${item.stock_count <= item.reorder_level ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.stock_count}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 max-w-xs truncate">{desc}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
