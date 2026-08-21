import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

export type UserRole =
  | 'CUSTOMER'
  | 'ADMIN'
  | 'SELLER'
  | 'DELIVERY'

export interface LocationRef {
  id?: string
  name: string
}

export interface User {
  id: string

  role: UserRole

  firstName: string
  lastName: string

  fullName?: string

  email: string
  phone?: string

  status?: string
  partnerId?: string

  profileImage?: string

  rating?: number
  deliveries?: number
  earnings?: number
  todayDeliveries?: number
  orders?: number

  mobile?: string

  currentAddress?: string
  permanentAddress?: string

  stateId?: string | null
  state?: LocationRef | null

  district?: string

  cityId?: string | null
  city?: LocationRef | null

  pincode?: string

  emergencyContactName?: string
  emergencyContactNumber?: string

  dateJoined?: string
  createdAt?: string
  updatedAt?: string

  vehicleType?: string
  vehicleNumber?: string

  dateOfBirth?: string
  gender?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean

  login: (
    emailOrPhone: string,
    password: string,
    role?: string
  ) => Promise<void>

  loginWithOTP: (
    phone: string,
    otp: string
  ) => Promise<void>

  signup: (
    data: Record<string, unknown>,
    role?: string
  ) => Promise<void>

  logout: () => void

  updateUser: (
    data: Partial<User>
  ) => void
}

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  )

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] =
    useState<User | null>(null)

  // ----------------------------------------------------------
  // LOAD EXISTING USER
  // ----------------------------------------------------------

  useEffect(() => {
    const token =
      localStorage.getItem('token')

    if (!token) {
      return
    }

    fetch(
      'http://localhost:3001/api/auth/me',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user)
        } else {
          localStorage.removeItem('token')
        }
      })
      .catch((error) => {
        console.error(
          'Failed to load current user:',
          error
        )
      })
  }, [])

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const login = useCallback(
    async (
      emailOrPhone: string,
      password: string,
      role: string = 'delivery'
    ) => {
      let endpoint = '/api/auth/login'

      if (
        role === 'customer' ||
        role === 'admin'
      ) {
        endpoint =
          '/api/auth/user/login'
      }

      if (role === 'seller') {
        endpoint =
          '/api/auth/seller/login'
      }

      const response = await fetch(
        `http://localhost:3001${endpoint}`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            email: emailOrPhone,
            password,
            phone: emailOrPhone,
          }),
        }
      )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Failed to login'
        )
      }

      localStorage.setItem(
        'token',
        data.token
      )

      setUser(data.user)
    },
    []
  )

  // ----------------------------------------------------------
  // OTP LOGIN
  // ----------------------------------------------------------

  const loginWithOTP = useCallback(
    async (
      phone: string,
      _otp: string
    ) => {
      const response = await fetch(
        'http://localhost:3001/api/auth/login',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            phone,
          }),
        }
      )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ||
            'Failed to login'
        )
      }

      localStorage.setItem(
        'token',
        data.token
      )

      setUser(data.user)
    },
    []
  )

  // ----------------------------------------------------------
  // SIGNUP
  // ----------------------------------------------------------

  const signup = useCallback(
    async (
      data: Record<
        string,
        unknown
      >,
      role: string = 'delivery'
    ) => {
      let endpoint =
        '/api/auth/signup'

      if (
        role === 'customer' ||
        role === 'admin'
      ) {
        endpoint =
          '/api/auth/user/signup'
      }

      if (role === 'seller') {
        endpoint =
          '/api/auth/seller/signup'
      }

      const requestData = {
        ...data,

        role:
          role === 'admin'
            ? 'ADMIN'
            : role === 'seller'
              ? 'SELLER'
              : role === 'delivery'
                ? 'DELIVERY'
                : 'CUSTOMER',
      }

      const response = await fetch(
        `http://localhost:3001${endpoint}`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify(
            requestData
          ),
        }
      )

      const responseData =
        await response.json()

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            'Failed to signup'
        )
      }

      localStorage.setItem(
        'token',
        responseData.token
      )

      setUser(
        responseData.user
      )
    },
    []
  )

  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  const logout = useCallback(() => {
    localStorage.removeItem('token')

    setUser(null)
  }, [])

  // ----------------------------------------------------------
  // UPDATE PROFILE
  // ----------------------------------------------------------

  const updateUser = useCallback(
    async (
      data: Partial<User>
    ) => {
      try {
        const token =
          localStorage.getItem(
            'token'
          )

        if (token) {
          await fetch(
            'http://localhost:3001/api/auth/me',
            {
              method: 'PUT',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${token}`,
              },

              body: JSON.stringify(
                data
              ),
            }
          )
        }

        setUser((previous) =>
          previous
            ? {
                ...previous,
                ...data,
              }
            : null
        )
      } catch (error) {
        console.error(
          'Failed to update user profile',
          error
        )
      }
    },
    []
  )

  return (
    <AuthContext.Provider
      value={{
        user,

        isAuthenticated:
          Boolean(user),

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
  const context =
    useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    )
  }

  return context
}