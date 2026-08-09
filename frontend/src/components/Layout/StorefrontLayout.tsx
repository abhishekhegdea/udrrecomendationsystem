import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { StorefrontNavbar } from './StorefrontNavbar'

export function StorefrontLayout() {
  const { user, isAuthenticated } = useAuth()

  // Non-customer roles must go through their own dashboards
  if (isAuthenticated && user) {
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
    if (user.role === 'SELLER') return <Navigate to="/seller" replace />
    if (user.role === 'DELIVERY') return <Navigate to="/delivery" replace />
    // CUSTOMER falls through to the storefront
  }

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <StorefrontNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
      
      {/* Simple Footer */}
      <footer className="bg-primary text-primary-foreground py-12 mt-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-serif italic mb-4">UdrCrafts</h2>
          <p className="text-primary-foreground/60 text-sm">Empowering Local Artisans. Delivered Globally.</p>
        </div>
      </footer>
    </div>
  )
}
