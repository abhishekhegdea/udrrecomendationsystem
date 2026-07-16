import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { deliveryPartners } from '@/data/partners'

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
  login: (phone: string, password: string) => Promise<void>
  loginWithOTP: (phone: string, otp: string) => Promise<void>
  signup: (data: Record<string, unknown>) => Promise<void>
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

const defaultUser: User = mapPartnerToUser(deliveryPartners[0])

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = useCallback(async (phone: string, _password: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    // Clean phone number to match format in data (e.g., removing spaces/country code)
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    const partner = deliveryPartners.find(p => p.mobile === cleanPhone) || deliveryPartners[0]
    setUser(mapPartnerToUser(partner))
  }, [])

  const loginWithOTP = useCallback(async (phone: string, _otp: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    const partner = deliveryPartners.find(p => p.mobile === cleanPhone) || deliveryPartners[0]
    setUser(mapPartnerToUser(partner))
  }, [])

  const signup = useCallback(async (_data: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setUser(defaultUser)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const updateUser = useCallback((data: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null))
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
