import { useState } from 'react'
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  LayoutDashboard,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Package,
  Wallet,
  Store,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function SellerLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    {
      icon: LayoutDashboard,
      label: 'My Store',
      path: '/seller',
    },
    {
      icon: Package,
      label: 'Products & Inventory',
      path: '/seller/products',
    },
    {
      icon: Wallet,
      label: 'Earnings & Payouts',
      path: '/seller/earnings',
    },
    {
      icon: FileText,
      label: 'Documents',
      path: '/seller/documents',
    },
    {
      icon: User,
      label: 'Store Profile',
      path: '/seller/profile',
    },
    {
      icon: Settings,
      label: 'Settings',
      path: '/seller/settings',
    },
  ]

  const SidebarContent = ({
    isMobile = false,
  }: {
    isMobile?: boolean
  }) => (
    <div className="flex flex-col h-full bg-card border-r border-border flex-shrink-0 w-full">
      <div className="flex items-center h-20 px-6 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <Store className="h-5 w-5 text-accent-foreground" />
          </div>

          {(!collapsed || isMobile) && (
            <div className="whitespace-nowrap">
              <p className="text-base font-bold text-foreground leading-tight">
                UdrCrafts Artisan
              </p>

              <p className="text-[11px] text-muted-foreground capitalize">
                Seller Portal
              </p>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />

              {(!collapsed || isMobile) && (
                <span>{item.label}</span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {!isMobile && (
        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      <div className="px-4 pb-4 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />

          {(!collapsed || isMobile) && (
            <span>Logout</span>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <motion.aside
        className="hidden lg:block z-40 h-full flex-shrink-0"
        animate={{
          width: collapsed ? 80 : 280,
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
      >
        <SidebarContent />
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />

            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              className="fixed left-0 top-0 h-screen w-72 bg-card z-50 lg:hidden shadow-2xl flex flex-col"
            >
              <div className="flex justify-end p-4 absolute top-0 right-0 z-50">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="p-2 bg-background rounded-full"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <SidebarContent isMobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          onMenuToggle={() => setMobileOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 lg:py-8">
          <div className="max-w-[1440px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom shadow-sm">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all',
                location.pathname === item.path
                  ? 'text-accent'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />

              <span className="text-[10px] font-medium">
                {item.label}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}