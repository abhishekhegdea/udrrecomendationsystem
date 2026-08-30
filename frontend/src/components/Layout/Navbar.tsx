import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Bell, Search, Menu, ChevronDown, LogOut, Truck, Sun, Moon } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

interface NavbarProps {
  onMenuToggle: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const getRoleNotifications = (role?: string) => {
    switch(role) {
      case 'ADMIN':
        return [
          { id: 1, title: 'New Seller Registration', message: 'Kashmir Looms is waiting for approval', time: '10m ago', unread: true },
          { id: 2, title: 'High Traffic Alert', message: 'Unusual spike in user registrations', time: '2h ago', unread: true },
          { id: 3, title: 'System Update', message: 'Database backup completed successfully', time: '1d ago', unread: false },
        ]
      case 'SELLER':
        return [
          { id: 1, title: 'New Order Received', message: 'Order #UDC-8821 needs packaging', time: '2m ago', unread: true },
          { id: 2, title: 'Payout Processed', message: '₹14,500 transferred to your bank account', time: '5h ago', unread: true },
          { id: 3, title: 'Low Inventory', message: 'Blue Pottery Vase is almost out of stock', time: '1d ago', unread: false },
        ]
      case 'DELIVERY':
        return [
          { id: 1, title: 'New Order Assigned', message: 'Order #UDC-4891 ready for pickup at Sector 4', time: '5m ago', unread: true },
          { id: 2, title: 'Payment Received', message: '₹450 credited to your wallet for recent delivery', time: '1h ago', unread: true },
          { id: 3, title: 'Document Verified', message: 'Your Driving License has been approved', time: '1d ago', unread: false },
        ]
      case 'CUSTOMER':
        return [
          { id: 1, title: 'Order Out for Delivery', message: 'Order #UDC-1102 will arrive today by 6 PM', time: '1h ago', unread: true },
          { id: 2, title: 'Order Confirmed', message: 'Your payment for Order #UDC-1102 was successful', time: '1d ago', unread: false },
          { id: 3, title: 'Welcome to UdrCrafts', message: 'Thanks for joining our artisan community!', time: '2d ago', unread: false },
        ]
      default:
        return [
          { id: 1, title: 'Welcome', message: 'Welcome to UdrCrafts dashboard', time: 'Just now', unread: true },
        ]
    }
  }

  const notifications = getRoleNotifications(user?.role)

  return (
    <header className="h-20 bg-background border-b border-border flex items-center justify-between px-6 lg:px-8 sticky top-0 z-30 shadow-sm">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2.5 rounded-[12px] hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="lg:hidden flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-saffron flex items-center justify-center">
            <Truck className="h-5 w-5 text-ink" />
          </div>
          <span className="text-sm font-bold text-foreground">UdrCrafts</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-muted rounded-[12px] border border-border w-72">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Search orders..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2.5 rounded-[12px] hover:bg-muted transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Moon className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 rounded-[12px] hover:bg-muted transition-colors"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-saffron rounded-full ring-2 ring-background" />
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-14 w-80 bg-card rounded-[18px] border border-border shadow-xl overflow-hidden"
              >
                <div className="p-5 border-b border-border">
                  <h3 className="text-sm font-semibold text-card-foreground">Notifications</h3>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        'p-4 border-b border-border last:border-0 hover:bg-muted transition-colors cursor-pointer',
                        n.unread && 'bg-saffron/10'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                            n.unread ? 'bg-saffron' : 'bg-transparent'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-3 p-1.5 rounded-[12px] hover:bg-muted transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-saffron/20 flex items-center justify-center text-sm font-bold text-ink">
              {user?.firstName?.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {user?.firstName || 'User'}
              </p>
              <p className="text-[11px] text-muted-foreground capitalize">{user?.role ? user.role.toLowerCase() : 'User'}</p>
            </div>
            <ChevronDown className="hidden md:block h-4 w-4 text-muted-foreground" />
          </button>

          <AnimatePresence>
            {showProfile && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-14 w-56 bg-card rounded-[18px] border border-border shadow-xl overflow-hidden"
              >
                <div className="p-5 border-b border-border flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-saffron/20 flex items-center justify-center text-sm font-bold text-ink">
                    {user?.firstName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => {
                      setShowProfile(false)
                      logout()
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
