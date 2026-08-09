import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
export interface User {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone: string
  status: 'Verified' | 'Pending' | 'Rejected'
  partnerId: string
  profileImage?: string
  rating?: number
  deliveries?: number
  earnings?: number
  todayDeliveries?: number
  mobile?: string
  currentAddress?: string
  permanentAddress?: string
  state?: string
  district?: string
  city?: string
  pincode?: string
  emergencyContactName?: string
  emergencyContactNumber?: string
  dateJoined?: string
  vehicleType?: string
  vehicleNumber?: string
  dateOfBirth?: string
  gender?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (emailOrPhone: string, password: string, role?: string) => Promise<void>
  loginWithOTP: (phone: string, otp: string) => Promise<void>
  signup: (data: Record<string, unknown>, role?: string) => Promise<void>
  logout: () => void
  updateUser: (data: Partial<User>) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapPartnerToUser = (partner: any): User => ({
  ...partner,
  id: partner.partnerId,
  fullName: `${partner.firstName} ${partner.lastName}`,
  phone: partner.mobile,
  status: partner.verificationStatus,
})



const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  
  // Load user on startup if token exists
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch('http://localhost:3001/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user)
        else localStorage.removeItem('token')
      })
      .catch(console.error)
    }
  }, [])

  const login = useCallback(async (emailOrPhone: string, password: string, role: string = 'delivery') => {
    let endpoint = '/api/auth/login'
    if (role === 'customer' || role === 'admin') endpoint = '/api/auth/user/login'
    if (role === 'seller') endpoint = '/api/auth/seller/login'

    const res = await fetch(`http://localhost:3001${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailOrPhone, password, phone: emailOrPhone })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to login')
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }, [])

  const loginWithOTP = useCallback(async (phone: string, _otp: string) => {
    const res = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to login')
    localStorage.setItem('token', data.token)
    setUser(data.user)
  }, [])

  const signup = useCallback(async (data: Record<string, unknown>, role: string = 'delivery') => {
    let endpoint = '/api/auth/signup'
    if (role === 'customer' || role === 'admin') endpoint = '/api/auth/user/signup'
    if (role === 'seller') endpoint = '/api/auth/seller/signup'

    // Inject role into signup data so backend knows it's an admin if requested
    const requestData = { ...data, role: role === 'admin' ? 'ADMIN' : 'CUSTOMER' }

    const res = await fetch(`http://localhost:3001${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.error || 'Failed to signup')
    localStorage.setItem('token', resData.token)
    setUser(resData.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  const updateUser = useCallback(async (data: Partial<User>) => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await fetch('http://localhost:3001/api/auth/me', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(data)
        });
      }
      setUser((prev) => (prev ? { ...prev, ...data } : null));
    } catch (err) {
      console.error('Failed to update user profile', err);
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        loginWithOTP,
        signup,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
