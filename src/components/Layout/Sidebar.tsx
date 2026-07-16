import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  User,
  FileText,
  History,
  Wallet,
  HeadphonesIcon,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Truck,
} from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: User, label: 'My Profile', path: '/dashboard/profile' },
  { icon: FileText, label: 'Documents', path: '/dashboard/documents' },
  { icon: History, label: 'Delivery History', path: '/dashboard/history', disabled: true },
  { icon: Wallet, label: 'Payments', path: '/dashboard/payments', disabled: true },
  { icon: HeadphonesIcon, label: 'Support', path: '/dashboard/support', disabled: true },
  { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onLogout: () => void
  isMobile?: boolean
}

export function Sidebar({ collapsed, onToggle, onLogout, isMobile = false }: SidebarProps) {
  const location = useLocation()

  return (
    <motion.aside
      className={cn(
        'bg-white border-r border-[#EAEAEA] z-40 flex flex-col h-full flex-shrink-0',
        !isMobile && 'hidden lg:flex'
      )}
      animate={{ width: collapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Logo */}
      <div className="flex items-center h-20 px-6 border-b border-[#EAEAEA]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#F9B000] flex items-center justify-center flex-shrink-0">
            <Truck className="h-5 w-5 text-[#111111]" />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="whitespace-nowrap"
            >
              <p className="text-base font-bold text-[#111111] leading-tight">UdrCrafts</p>
              <p className="text-[11px] text-gray-400">Partner Portal</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={(e) => item.disabled && e.preventDefault()}
              className={cn(
                'relative flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-[#F9B000]/10 text-[#111111]'
                  : item.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-500 hover:text-[#111111] hover:bg-gray-50'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeNav"
                  className="absolute inset-0 bg-[#F9B000]/10 rounded-[12px]"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon className="h-5 w-5 relative z-10 flex-shrink-0" />
              {!collapsed && (
                <span className="relative z-10 whitespace-nowrap">
                  {item.label}
                  {item.disabled && (
                    <span className="ml-2 text-[10px] text-gray-300 font-medium">Soon</span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-4 py-3 border-t border-[#EAEAEA]">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] text-sm text-gray-400 hover:text-[#111111] hover:bg-gray-50 transition-all"
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

      {/* Logout */}
      <div className="px-4 pb-4">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium text-gray-500 hover:text-[#EF4444] hover:bg-red-50 transition-all"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </motion.aside>
  )
}

// Mobile Bottom Navigation
export function MobileBottomNav() {
  const location = useLocation()
  const mobileNavItems = navItems.filter((item) => !item.disabled).slice(0, 5)

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EAEAEA] z-40 safe-area-bottom shadow-[0_-1px_0_0_#EAEAEA]">
      <div className="flex items-center justify-around px-2 py-2">
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all',
                isActive ? 'text-[#F9B000]' : 'text-gray-400'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
