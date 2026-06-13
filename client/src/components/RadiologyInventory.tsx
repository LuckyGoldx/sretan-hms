import { Scan } from 'lucide-react'
import InventoryManager from './InventoryManager'

export default function RadiologyInventory() {
  return <InventoryManager category="radiology" title="Radiology Inventory" icon={Scan} backPath="/dashboard" />
}
