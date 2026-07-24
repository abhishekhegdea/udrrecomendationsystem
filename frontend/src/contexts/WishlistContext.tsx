import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'

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
  const [items, setItems] = useState<WishlistItem[]>([])

  // Load wishlist
  useEffect(() => {
    if (isAuthenticated && user) {
      // Load from DB
      axios.get(`http://localhost:3001/api/products/wishlist/${user.id}`)
        .then(res => setItems(res.data))
        .catch(console.error)
    } else {
      // Load from local storage
      const saved = localStorage.getItem('udrcrafts_wishlist')
      if (saved) {
        try {
          setItems(JSON.parse(saved))
        } catch (e) {
          console.error('Failed to parse wishlist')
        }
      } else {
        setItems([])
      }
    }
  }, [isAuthenticated, user])

  // Save to local storage if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.setItem('udrcrafts_wishlist', JSON.stringify(items))
    }
  }, [items, isAuthenticated])

  const toggleWishlist = async (productId: string) => {
    const exists = items.some(i => i.productId === productId)
    
    // Optimistic UI update
    if (exists) {
      setItems(prev => prev.filter(i => i.productId !== productId))
    } else {
      setItems(prev => [...prev, { productId }])
    }

    if (isAuthenticated && user) {
      try {
        if (exists) {
          await axios.delete(`http://localhost:3001/api/products/wishlist/${user.id}/${productId}`)
        } else {
          await axios.post(`http://localhost:3001/api/products/wishlist`, { userId: user.id, productId })
        }
      } catch (err) {
        console.error('Wishlist sync failed', err)
        // Revert on failure (simple version: just refresh)
        const res = await axios.get(`http://localhost:3001/api/products/wishlist/${user.id}`)
        setItems(res.data)
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
