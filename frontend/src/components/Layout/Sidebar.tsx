import {
  NavLink,
  useLocation,
} from 'react-router-dom'

import { motion } from 'framer-motion'

import {
  LayoutDashboard,
  User,
  History,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Truck,
  Package,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  icon: LucideIcon

  label: string

  path: string

  disabled?: boolean
}

interface SidebarProps {
  collapsed: boolean

  onToggle: () => void

  onLogout: () => void

  isMobile?: boolean
}

export function Sidebar({
  collapsed,
  onToggle,
  onLogout,
  isMobile = false,
}: SidebarProps) {
  const location =
    useLocation()

  const { user } =
    useAuth()

  let navItems: NavItem[] = [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      path: '/dashboard',
    },

    {
      icon: User,
      label: 'My Profile',
      path: '/dashboard/profile',
    },

    {
      icon: Settings,
      label: 'Settings',
      path: '/dashboard/settings',
    },
  ]

  // ----------------------------------------------------------
  // ADMIN
  // ----------------------------------------------------------

  if (user?.role === 'ADMIN') {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'Dispatch Center',
        path: '/dashboard',
      },

      {
        icon: User,
        label: 'Admin Profile',
        path: '/dashboard/profile',
      },

      {
        icon: Settings,
        label: 'System Settings',
        path: '/dashboard/settings',
      },
    ]
  }

  // ----------------------------------------------------------
  // SELLER
  // ----------------------------------------------------------

  else if (
    user?.role === 'SELLER'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'My Store',
        path: '/dashboard',
      },

      {
        icon: Package,
        label: 'My Products',
        path: '/dashboard/documents',
      },

      {
        icon: Wallet,
        label: 'Earnings',
        path: '/dashboard/payments',
        disabled: true,
      },

      {
        icon: User,
        label: 'Store Profile',
        path: '/dashboard/profile',
      },

      {
        icon: Settings,
        label: 'Settings',
        path: '/dashboard/settings',
      },
    ]
  }

  // ----------------------------------------------------------
  // DELIVERY
  // ----------------------------------------------------------

  else if (
    user?.role === 'DELIVERY'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'My Routes',
        path: '/dashboard',
      },

      {
        icon: History,
        label: 'Delivery History',
        path: '/dashboard/history',
        disabled: true,
      },

      {
        icon: Wallet,
        label: 'Earnings',
        path: '/dashboard/payments',
        disabled: true,
      },

      {
        icon: User,
        label: 'My Profile',
        path: '/dashboard/profile',
      },

      {
        icon: Settings,
        label: 'Settings',
        path: '/dashboard/settings',
      },
    ]
  }

  // ----------------------------------------------------------
  // CUSTOMER
  // ----------------------------------------------------------

  else if (
    user?.role === 'CUSTOMER'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'My Account',
        path: '/dashboard',
      },

      {
        icon: ShoppingBag,
        label: 'Order History',
        path: '/dashboard/history',
        disabled: true,
      },

      {
        icon: User,
        label: 'Profile',
        path: '/dashboard/profile',
      },

      {
        icon: Settings,
        label: 'Settings',
        path: '/dashboard/settings',
      },
    ]
  }

  return (
    <motion.aside
      className={cn(
        'bg-card border-r border-border z-40 flex flex-col h-full flex-shrink-0',

        !isMobile &&
          'hidden lg:flex'
      )}
      animate={{
        width:
          collapsed
            ? 80
            : 280,
      }}
      transition={{
        duration: 0.3,
        ease: 'easeInOut',
      }}
    >
      {/* Logo */}

      <div className="flex items-center h-20 px-6 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-saffron flex items-center justify-center flex-shrink-0">
            <Truck className="h-5 w-5 text-ink" />
          </div>

          {!collapsed && (
            <motion.div
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
              className="whitespace-nowrap"
            >
              <p className="text-base font-bold text-foreground leading-tight">
                UdrCrafts
              </p>

              <p className="text-[11px] text-muted-foreground capitalize">
                {user?.role?.toLowerCase() ||
                  'Partner'}{' '}
                Portal
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}

      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        {navItems.map(
          (item) => {
            const isActive =
              location.pathname ===
              item.path

            return (
              <NavLink
                key={
                  item.path +
                  item.label
                }
                to={item.path}
                onClick={(event) => {
                  if (
                    item.disabled
                  ) {
                    event.preventDefault()
                  }
                }}
                aria-disabled={
                  item.disabled
                }
                className={cn(
                  'relative flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium transition-all duration-200 group',

                  isActive
                    ? 'bg-saffron/10 text-foreground'
                    : item.disabled
                      ? 'text-muted-foreground/50 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-saffron/10 rounded-[12px]"
                    transition={{
                      type: 'spring',

                      stiffness:
                        300,

                      damping:
                        30,
                    }}
                  />
                )}

                <item.icon className="h-5 w-5 relative z-10 flex-shrink-0" />

                {!collapsed && (
                  <span className="relative z-10 whitespace-nowrap">
                    {item.label}

                    {item.disabled && (
                      <span className="ml-2 text-[10px] text-muted-foreground/50 font-medium">
                        Soon
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            )
          }
        )}
      </nav>

      {/* Collapse */}

      {!isMobile && (
        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />

                <span>
                  Collapse
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Logout */}

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[12px] text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />

          {!collapsed && (
            <span>
              Logout
            </span>
          )}
        </button>
      </div>
    </motion.aside>
  )
}

export function MobileBottomNav() {
  const location =
    useLocation()

  const { user } =
    useAuth()

  let navItems: NavItem[] = [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      path: '/dashboard',
    },

    {
      icon: User,
      label: 'Profile',
      path: '/dashboard/profile',
    },
  ]

  if (user?.role === 'ADMIN') {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'Dispatch',
        path: '/dashboard',
      },

      {
        icon: User,
        label: 'Profile',
        path: '/dashboard/profile',
      },
    ]
  } else if (
    user?.role === 'SELLER'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'Store',
        path: '/dashboard',
      },

      {
        icon: Package,
        label: 'Products',
        path: '/dashboard/documents',
      },

      {
        icon: User,
        label: 'Profile',
        path: '/dashboard/profile',
      },
    ]
  } else if (
    user?.role === 'DELIVERY'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'Routes',
        path: '/dashboard',
      },

      {
        icon: History,
        label: 'History',
        path: '/dashboard/history',
      },

      {
        icon: User,
        label: 'Profile',
        path: '/dashboard/profile',
      },
    ]
  } else if (
    user?.role === 'CUSTOMER'
  ) {
    navItems = [
      {
        icon: LayoutDashboard,
        label: 'Account',
        path: '/dashboard',
      },

      {
        icon: ShoppingBag,
        label: 'Orders',
        path: '/dashboard/history',
      },
    ]
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 safe-area-bottom shadow-sm">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map(
          (item) => {
            const isActive =
              location.pathname ===
              item.path

            return (
              <NavLink
                key={
                  item.path +
                  item.label
                }
                to={item.path}
                onClick={(event) => {
                  if (
                    item.disabled
                  ) {
                    event.preventDefault()
                  }
                }}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all',

                  isActive
                    ? 'text-saffron'
                    : item.disabled
                      ? 'text-muted-foreground/40'
                      : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />

                <span className="text-[10px] font-medium">
                  {item.label}
                </span>
              </NavLink>
            )
          }
        )}
      </div>
    </nav>
  )
}