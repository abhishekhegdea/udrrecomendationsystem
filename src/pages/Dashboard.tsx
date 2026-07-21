import { useAuth } from '@/contexts/AuthContext'
import { AdminDashboard } from './dashboards/AdminDashboard'
import { SellerDashboard } from './dashboards/SellerDashboard'
import { DeliveryDashboard } from './dashboards/DeliveryDashboard'
import { CustomerDashboard } from './dashboards/CustomerDashboard'

export function DashboardPage() {
  const { user } = useAuth()

  if (user?.role === 'CUSTOMER') {
    return <CustomerDashboard />
  }

  if (user?.role === 'SELLER') {
    return <SellerDashboard />
  }

  if (user?.role === 'DELIVERY') {
    return <DeliveryDashboard />
  }

  // Default to Admin or fallback
  return <AdminDashboard />
}
