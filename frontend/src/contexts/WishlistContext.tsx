import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import api from '@/lib/api'
import { useAuth } from './AuthContext'

const LS_KEY = 'udrcrafts_wishlist'

function loadFromStorage(): { productId: string }[] {
  try {
    const saved = localStorage.getItem(LS_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveToStorage(items: { productId: string }[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export interface WishlistItem {
  productId: string
}

interface WishlistContextType {
  items: WishlistItem[]
  toggleWishlist: (productId: string) => Promise<void>
  isInWishlist: (productId: string) => boolean
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined)

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  // Always seed from localStorage first so wishlist shows immediately
  const [items, setItems] = useState<WishlistItem[]>(loadFromStorage)
  const fetchAbortRef = useRef<AbortController | null>(null)

  // Sync with server in the background (non-blocking)
  useEffect(() => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    if (isAuthenticated && user) {
      api.get(`http://localhost:3001/api/products/wishlist/${user.id}`, {
        signal: controller.signal,
        timeout: 4000,
      })
        .then(res => {
          const serverItems = Array.isArray(res.data) ? res.data : []
          setItems(serverItems)
          saveToStorage(serverItems)
        })
        .catch(() => {
          // Server unavailable — keep localStorage items
        })
    }

    return () => fetchAbortRef.current?.abort()
  }, [isAuthenticated, user])

  // Persist to localStorage whenever items change
  useEffect(() => {
    saveToStorage(items)
  }, [items])

  const toggleWishlist = async (productId: string) => {
    const exists = items.some(i => i.productId === productId)

    // Optimistic UI update (saved to localStorage via the items effect)
    if (exists) {
      setItems(prev => prev.filter(i => i.productId !== productId))
    } else {
      setItems(prev => [...prev, { productId }])
    }

    // Best-effort server sync
    if (isAuthenticated && user) {
      try {
        if (exists) {
          await api.delete(`http://localhost:3001/api/products/wishlist/${user.id}/${productId}`, { timeout: 4000 })
        } else {
          await api.post(`http://localhost:3001/api/products/wishlist`, { userId: user.id, productId }, { timeout: 4000 })
        }
      } catch {
        // Server unavailable — localStorage already updated
      }
    }
  }

  const isInWishlist = (productId: string) => {
    return items.some(i => i.productId === productId)
  }

  return (
    <WishlistContext.Provider value={{ items, toggleWishlist, isInWishlist }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider')
  }
  return context
}
