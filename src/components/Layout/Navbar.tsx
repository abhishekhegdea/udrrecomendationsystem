import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Bell, Search, Menu, ChevronDown, LogOut, Truck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

interface NavbarProps {
  onMenuToggle: () => void
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const { user, logout } = useAuth()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const notifications = [
    { id: 1, title: 'New order assigned', message: 'Order #UDC-4891 ready for pickup', time: '5m ago', unread: true },
    { id: 2, title: 'Payment received', message: '₹2,400 credited to your wallet', time: '1h ago', unread: true },
    { id: 3, title: 'Document verified', message: 'Your Aadhaar has been verified', time: '1d ago', unread: false },
  ]

  return (
    <header className="h-20 bg-white border-b border-[#EAEAEA] flex items-center justify-between px-6 lg:px-8 sticky top-0 z-30 shadow-[0_1px_0_0_#EAEAEA]">
      {/* Left */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2.5 rounded-[12px] hover:bg-gray-50 transition-colors"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
        <div className="lg:hidden flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-[#F9B000] flex items-center justify-center">
            <Truck className="h-5 w-5 text-[#111111]" />
          </div>
          <span className="text-sm font-bold text-[#111111]">UdrCrafts</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-gray-50 rounded-[12px] border border-[#EAEAEA] w-72">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search orders..."
            className="bg-transparent text-sm text-gray-600 placeholder:text-gray-400 focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2.5 rounded-[12px] hover:bg-gray-50 transition-colors"
          >
            <Bell className="h-5 w-5 text-gray-600" />
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#F9B000] rounded-full ring-2 ring-white" />
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-14 w-80 bg-white rounded-[18px] border border-[#EAEAEA] shadow-xl overflow-hidden"
              >
                <div className="p-5 border-b border-[#EAEAEA]">
                  <h3 className="text-sm font-semibold text-[#111111]">Notifications</h3>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={cn(
                        'p-4 border-b border-[#EAEAEA] last:border-0 hover:bg-gray-50 transition-colors cursor-pointer',
                        n.unread && 'bg-[#F9B000]/5'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                            n.unread ? 'bg-[#F9B000]' : 'bg-transparent'
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#111111]">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
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
            className="flex items-center gap-3 p-1.5 rounded-[12px] hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-[#F9B000]/20 flex items-center justify-center text-sm font-bold text-[#111111]">
              {user?.firstName?.charAt(0) || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold text-[#111111] leading-tight">
                {user?.firstName || 'User'}
              </p>
              <p className="text-[11px] text-gray-400">Verified Partner</p>
            </div>
            <ChevronDown className="hidden md:block h-4 w-4 text-gray-400" />
          </button>

          <AnimatePresence>
            {showProfile && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-14 w-56 bg-white rounded-[18px] border border-[#EAEAEA] shadow-xl overflow-hidden"
              >
                <div className="p-5 border-b border-[#EAEAEA] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#F9B000]/20 flex items-center justify-center text-sm font-bold text-[#111111]">
                    {user?.firstName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#111111]">{user?.fullName}</p>
                    <p className="text-xs text-gray-400">{user?.partnerId}</p>
                  </div>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => {
                      setShowProfile(false)
                      logout()
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-[#EF4444] hover:bg-red-50 transition-colors"
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
