import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { CartProvider } from '@/contexts/CartContext'
import { WishlistProvider } from '@/contexts/WishlistContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { QuickViewProvider } from '@/contexts/QuickViewContext'
import { Toaster } from 'sonner'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { ProfilePage } from '@/pages/Profile'
import { DocumentsPage } from '@/pages/Documents'
import { SettingsPage } from '@/pages/Settings'
import type { ReactNode } from 'react'

const queryClient = new QueryClient()

function ProtectedRoute({ children, allowedRoles }: { children: ReactNode, allowedRoles?: string[] }) {
  const { isAuthenticated, user } = useAuth()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect unauthorized users to their correct dashboard
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />
    if (user.role === 'SELLER') return <Navigate to="/seller" replace />
    if (user.role === 'DELIVERY') return <Navigate to="/delivery" replace />
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated) {
    if (user?.role === 'CUSTOMER') {
      return <Navigate to="/" replace />
    }
    if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />
    if (user?.role === 'SELLER') return <Navigate to="/seller" replace />
    if (user?.role === 'DELIVERY') return <Navigate to="/delivery" replace />
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

import { StorefrontLayout } from '@/components/Layout/StorefrontLayout'
import { HomePage } from '@/pages/Home'
import { CartPage } from '@/pages/Cart'
import { ProductDetailsPage } from '@/pages/ProductDetails'
import { SearchPage } from '@/pages/Search'
import { CheckoutPage } from '@/pages/Checkout'

import { AdminLayout } from '@/components/Layout/AdminLayout'
import { SellerLayout } from '@/components/Layout/SellerLayout'
import { DeliveryLayout } from '@/components/Layout/DeliveryLayout'
import { CustomerLayout } from '@/components/Layout/CustomerLayout'
import { AdminDashboard } from '@/pages/dashboards/AdminDashboard'
import { AdminProfile } from '@/pages/dashboards/AdminProfile'
import { FairnessConfigPanel } from '@/pages/dashboards/FairnessConfigPanel'
import { SellerDashboard } from '@/pages/dashboards/SellerDashboard'
import { SellerProductsPage } from '@/pages/dashboards/SellerProductsPage'
import { DeliveryDashboard } from '@/pages/dashboards/DeliveryDashboard'
import { CustomerDashboard } from '@/pages/dashboards/CustomerDashboard'

import { WishlistPage } from '@/pages/dashboards/WishlistPage'
import { RecommendationTester } from '@/pages/dev/RecommendationTester'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/dev/recommendations" element={<RecommendationTester />} />
      <Route path="/" element={<StorefrontLayout />}>
        <Route index element={<HomePage />} />
        <Route path="cart" element={<CartPage />} />
        <Route 
          path="checkout" 
          element={
            <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN']}>
              <CheckoutPage />
            </ProtectedRoute>
          } 
        />
        <Route path="product/:id" element={<ProductDetailsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="category/:categoryId" element={<SearchPage />} />
      </Route>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      
      {/* Role Specific Isolated Dashboards */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="fairness" element={<FairnessConfigPanel />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/seller" element={<ProtectedRoute allowedRoles={['SELLER']}><SellerLayout /></ProtectedRoute>}>
        <Route index element={<SellerDashboard />} />
        <Route path="products" element={<SellerProductsPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="earnings" element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['DELIVERY']}><DeliveryLayout /></ProtectedRoute>}>
        <Route index element={<DeliveryDashboard />} />
        <Route path="history" element={<DashboardPage />} />
        <Route path="earnings" element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/customer" element={<ProtectedRoute allowedRoles={['CUSTOMER']}><CustomerLayout /></ProtectedRoute>}>
        <Route index element={<CustomerDashboard />} />
        <Route path="orders" element={<CustomerDashboard />} />
        <Route path="wishlist" element={<WishlistPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              <ThemeProvider defaultTheme="light" storageKey="udrcrafts-theme">
                <QuickViewProvider>
                  <AppRoutes />
                  <Toaster
                    position="top-right"
                    richColors
                    closeButton
                    toastOptions={{
                      style: { fontFamily: 'inherit' },
                      duration: 3000
                    }}
                  />
                </QuickViewProvider>
              </ThemeProvider>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App

