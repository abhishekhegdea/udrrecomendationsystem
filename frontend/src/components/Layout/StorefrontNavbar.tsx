import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Search, ShoppingBag, Menu, User, LogOut, Heart, ChevronDown, Package, Settings, LayoutDashboard, ShieldCheck, Truck, Store, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCart } from '@/contexts/CartContext'
import { MobileMenuDrawer } from './MobileMenuDrawer'

export function StorefrontNavbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const { totalItems, isSyncing } = useCart()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Non-CUSTOMER roles get a simplified navbar with a "Go to Dashboard" button
  const isNonCustomer = isAuthenticated && user && user.role !== 'CUSTOMER'

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  /** Get dashboard link and icon based on user role */
  const getDashboardInfo = () => {
    if (!user) return { path: '/login', label: 'Login', icon: User }
    switch (user.role) {
      case 'ADMIN': return { path: '/admin', label: 'Admin Dashboard', icon: ShieldCheck }
      case 'SELLER': return { path: '/seller', label: 'Seller Dashboard', icon: Store }
      case 'DELIVERY': return { path: '/delivery', label: 'Delivery Dashboard', icon: Truck }
      default: return { path: '/customer', label: 'My Account', icon: User }
    }
  }

  return (
    <>
      <MobileMenuDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <button 
              className="lg:hidden p-2 text-foreground hover:text-primary transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <Link to="/" className="text-2xl font-display font-bold text-primary tracking-tight">
              UdrCrafts
            </Link>
            {/* Role badge for non-customer users */}
            {isNonCustomer && (
              <span className="hidden sm:inline-flex ml-2 px-2.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider rounded-full">
                {user?.role === 'ADMIN' ? 'Admin' : user?.role === 'SELLER' ? 'Seller' : 'Delivery'}
              </span>
            )}
          </div>

        {/* Desktop Navigation — hidden for non-CUSTOMER roles */}
        {!isNonCustomer && (
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-foreground">
            <Link to="/category/furniture" className="hover:text-primary transition-colors">Furniture</Link>
            <Link to="/category/decor" className="hover:text-primary transition-colors">Home Decor</Link>
            <Link to="/category/textiles" className="hover:text-primary transition-colors">Textiles</Link>
            <Link to="/category/art" className="hover:text-primary transition-colors">Art & Paintings</Link>
          </nav>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          {isNonCustomer ? (
            /* ── Non-CUSTOMER: simplified navbar ── */
            <>
              <Link
                to={getDashboardInfo().path}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm hover:shadow-md active:scale-95"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Go to Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </Link>

              {/* User dropdown with role-aware links */}
              <div
                className="relative"
                onMouseEnter={() => setIsDropdownOpen(true)}
                onMouseLeave={() => setIsDropdownOpen(false)}
              >
                <button className="p-2 text-foreground hover:text-primary transition-colors cursor-pointer">
                  <User className="h-5 w-5" />
                </button>
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full pt-2 w-56 animate-in fade-in slide-in-from-top-2">
                    <div className="bg-card border border-border shadow-xl rounded-2xl overflow-hidden py-2">
                      <div className="px-4 py-2 border-b border-border">
                        <p className="text-sm font-semibold text-foreground">{user?.firstName} {user?.lastName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()} account</p>
                      </div>
                      <Link to={getDashboardInfo().path} className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium text-foreground">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" /> Dashboard
                      </Link>
                      <button 
                        onClick={logout} 
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium text-muted-foreground"
                      >
                        <LogOut className="h-4 w-4" /> Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── CUSTOMER / guest: full shopper navbar ── */
            <>
              <div className="hidden md:flex relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search handcrafted items..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                  className="w-full pl-9 pr-4 py-2 bg-muted rounded-full text-sm border-transparent focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                />
              </div>

              <Link to="/cart" className="p-2 text-foreground hover:text-primary transition-colors relative" title={isSyncing ? 'Syncing cart…' : 'Cart'}>
                <ShoppingBag className="h-5 w-5" />
                {isSyncing ? (
                  <span className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  </span>
                ) : totalItems > 0 ? (
                  <span className="absolute top-0 right-0 w-4 h-4 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                ) : null}
              </Link>

              {isAuthenticated ? (
                <div 
                  className="relative hidden md:block"
                  onMouseEnter={() => setIsDropdownOpen(true)}
                  onMouseLeave={() => setIsDropdownOpen(false)}
                >
                  <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer">
                    <User className="h-5 w-5" />
                    <span className="hidden lg:inline-block">Hi, {user?.firstName}</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <div className="absolute right-0 top-full pt-2 w-56 animate-in fade-in slide-in-from-top-2">
                      <div className="bg-card border border-border shadow-xl rounded-2xl overflow-hidden py-2">
                        <Link to="/customer/profile" className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium text-foreground">
                          <Settings className="h-4 w-4 text-muted-foreground" /> My Profile
                        </Link>
                        <Link to="/customer/orders" className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium text-foreground">
                          <Package className="h-4 w-4 text-muted-foreground" /> Orders
                        </Link>
                        <Link to="/customer/wishlist" className="flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-sm font-medium text-foreground border-b border-border">
                          <Heart className="h-4 w-4 text-muted-foreground" /> Wishlist
                        </Link>
                        <button 
                          onClick={logout} 
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium text-muted-foreground"
                        >
                          <LogOut className="h-4 w-4" /> Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/login" className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors">
                  <User className="h-4 w-4" />
                  Sign In
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
    </>
  )
}
