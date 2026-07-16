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



const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = useCallback(async (phone: string, _password: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    // Clean phone number to match format in data (e.g., removing spaces/country code)
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    
    const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]') as User[]
    const localUser = registeredUsers.find(u => u.phone === cleanPhone)
    
    if (localUser) {
      setUser(localUser)
      return
    }

    const partner = deliveryPartners.find(p => p.mobile === cleanPhone)
    if (partner) {
      setUser(mapPartnerToUser(partner))
      return
    }
    
    throw new Error('Account not found. Please create a new account.')
  }, [])

  const loginWithOTP = useCallback(async (phone: string, _otp: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const cleanPhone = phone.replace(/\D/g, '').slice(-10)
    
    const registeredUsers = JSON.parse(localStorage.getItem('registeredUsers') || '[]') as User[]
    const localUser = registeredUsers.find(u => u.phone === cleanPhone)
    
    if (localUser) {
      setUser(localUser)
      return
    }

    const partner = deliveryPartners.find(p => p.mobile === cleanPhone)
    if (partner) {
      setUser(mapPartnerToUser(partner))
      return
    }
    
    throw new Error('Account not found. Please create a new account.')
  }, [])

  const signup = useCallback(async (data: Record<string, unknown>) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    
    const partnerId = `UDRSP${Math.floor(1000 + Math.random() * 9000)}`
    const newUser: User = {
      id: partnerId,
      partnerId: partnerId,
      firstName: (data.firstName as string) || '',
      lastName: (data.lastName as string) || '',
      fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
      email: (data.email as string) || '',
      phone: (data.mobileNumber as string)?.replace(/\D/g, '').slice(-10) || '',
      status: 'Pending',
      mobile: (data.mobileNumber as string) || '',
      currentAddress: (data.currentAddress as string) || '',
      permanentAddress: (data.permanentAddress as string) || '',
      state: (data.state as string) || '',
      district: (data.district as string) || '',
      city: (data.city as string) || '',
      pincode: (data.pincode as string) || '',
      emergencyContactName: (data.emergencyContactName as string) || '',
      emergencyContactNumber: (data.emergencyContactNumber as string) || '',
      vehicleType: (data.vehicleType as string) || '',
      vehicleNumber: (data.vehicleRegistrationNumber as string) || '',
      dateOfBirth: (data.dateOfBirth as string) || '',
      gender: (data.gender as string) || '',
      dateJoined: new Date().toISOString().split('T')[0],
      rating: 0,
      deliveries: 0,
      earnings: 0,
      todayDeliveries: 0,
    }
    
    const existing = JSON.parse(localStorage.getItem('registeredUsers') || '[]')
    existing.push(newUser)
    localStorage.setItem('registeredUsers', JSON.stringify(existing))
    
    setUser(newUser)
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
