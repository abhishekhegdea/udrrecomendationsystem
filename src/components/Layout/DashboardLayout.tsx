import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar, MobileBottomNav } from './Sidebar'
import { Navbar } from './Navbar'
import { useAuth } from '@/contexts/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

export function DashboardLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-[#FAFAFA] overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onLogout={handleLogout}
      />

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed left-0 top-0 h-screen w-72 bg-white z-50 lg:hidden shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#EAEAEA]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-[#F9B000] flex items-center justify-center">
                    <span className="text-sm font-bold text-[#111111]">U</span>
                  </div>
                  <span className="text-sm font-bold text-[#111111]">UdrCrafts Portal</span>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-2 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <div className="overflow-y-auto h-full pb-20">
                <Sidebar
                  collapsed={false}
                  onToggle={() => {}}
                  onLogout={() => {
                    setMobileSidebarOpen(false)
                    handleLogout()
                  }}
                  isMobile={true}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar onMenuToggle={() => setMobileSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto px-6 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
          <div className="max-w-[1440px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Outlet />
            </motion.div>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  )
}
