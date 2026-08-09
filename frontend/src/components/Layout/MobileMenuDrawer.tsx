import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, Home, ShoppingBag, Heart, User, LogOut, Package, Settings, Sofa, Shirt, Palette, Music, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { useWishlist } from '@/contexts/WishlistContext'

interface MobileMenuDrawerProps {
  open: boolean
  onClose: () => void
}

const categoryLinks = [
  { icon: Sofa, label: 'Furniture', path: '/category/furniture' },
  { icon: Shirt, label: 'Home Decor', path: '/category/decor' },
  { icon: Palette, label: 'Textiles', path: '/category/textiles' },
  { icon: Music, label: 'Art & Paintings', path: '/category/art' },
]

const quickLinks = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: ShoppingBag, label: 'Cart', path: '/cart' },
  { icon: Search, label: 'All Products', path: '/search' },
]

const accountLinks = [
  { icon: User, label: 'My Profile', path: '/customer/profile' },
  { icon: Package, label: 'Orders', path: '/customer/orders' },
  { icon: Heart, label: 'Wishlist', path: '/customer/wishlist' },
  { icon: Settings, label: 'Settings', path: '/settings' },
]

export function MobileMenuDrawer({ open, onClose }: MobileMenuDrawerProps) {
  const { user, isAuthenticated, logout } = useAuth()
  const { totalItems, isSyncing } = useCart()
  const { items: wishlistItems } = useWishlist()
  const navigate = useNavigate()

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleLinkClick = (path: string) => {
    onClose()
    navigate(path)
  }

  const handleLogout = () => {
    onClose()
    logout()
    navigate('/')
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 w-full max-w-sm bg-background z-[70] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-border flex-shrink-0">
              <Link
                to="/"
                onClick={onClose}
                className="text-xl font-display font-bold text-primary tracking-tight"
              >
                UdrCrafts
              </Link>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
                aria-label="Close menu"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* User Card */}
              <div className="px-5 pt-5 pb-3">
                {isAuthenticated ? (
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
                      {user?.firstName?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-muted to-muted/50 border border-border">
                    <div className="w-12 h-12 rounded-full bg-muted-foreground/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">Welcome!</p>
                      <p className="text-xs text-muted-foreground">Sign in for a better experience</p>
                    </div>
                    <Link
                      to="/login"
                      onClick={onClose}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
                    >
                      Sign In
                    </Link>
                  </div>
                )}
              </div>

              {/* Quick Links */}
              <div className="px-5 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Quick Links
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {quickLinks.map((link) => (
                    <button
                      key={link.label}
                      onClick={() => handleLinkClick(link.path)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors group"
                    >
                      <div className="relative">
                        <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        {link.label === 'Cart' && (
                          isSyncing ? (
                            <Loader2 className="absolute -top-1.5 -right-1.5 h-3 w-3 animate-spin text-primary" />
                          ) : totalItems > 0 ? (
                            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent text-accent-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                              {totalItems}
                            </span>
                          ) : null
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {link.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Shop by Category */}
              <div className="px-5 py-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Shop by Category
                </p>
                <div className="space-y-1">
                  {categoryLinks.map((link) => (
                    <button
                      key={link.label}
                      onClick={() => handleLinkClick(link.path)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                        <link.icon className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{link.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Links (authenticated only) */}
              {isAuthenticated && (
                <div className="px-5 py-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    My Account
                  </p>
                  <div className="space-y-1">
                    {accountLinks.map((link) => {
                      const Icon = link.icon
                      return (
                        <button
                          key={link.label}
                          onClick={() => handleLinkClick(link.path)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors group"
                        >
                          <div className="w-9 h-9 rounded-lg bg-muted-foreground/10 flex items-center justify-center flex-shrink-0 group-hover:bg-muted-foreground/20 transition-colors">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex items-center justify-between flex-1">
                            <span className="text-sm font-medium text-foreground">{link.label}</span>
                            {link.label === 'Wishlist' && wishlistItems.length > 0 && (
                              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                {wishlistItems.length}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Spacer */}
              <div className="h-6" />
            </div>

            {/* Footer */}
            <div className="border-t border-border px-5 py-4 flex-shrink-0">
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              ) : (
                <div className="flex gap-2">
                  <Link
                    to="/login"
                    onClick={onClose}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <User className="h-4 w-4" />
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    onClick={onClose}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
