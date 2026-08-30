import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { trackCart } from '@/lib/track'
import { useAuth } from './AuthContext'

export interface CartItem {
  id: string
  productId: string
  name: string
  price: number
  quantity: number
  image?: string
  currency?: string
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'id'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  /** True while the cart is syncing with the server (initial pull / merge) */
  isSyncing: boolean
  /** Ensure the server cart matches the local cart; returns the server CartItem ids */
  flushCartToServer: () => Promise<string[]>
}

const CART_API = 'http://localhost:3001/api/cart'

const CartContext = createContext<CartContextType | undefined>(undefined)

/** Map a server CartItem row (with embedded product) to the local shape */
function mapServerItem(item: any): CartItem {
  return {
    id: item.id,
    productId: item.productId,
    name: item.product?.name || '',
    price: item.product?.price ?? 0,
    quantity: item.quantity,
    image: item.product?.images?.[0]?.url,
    currency: item.product?.currency,
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<CartItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  // Mirror of items for use inside effects (avoids stale closures)
  const itemsRef = useRef<CartItem[]>([])
  
  // Watch for logout to clear the cart state so it doesn't leak into the next login
  const previousUserRef = useRef(user?.id)
  useEffect(() => {
    // If we had a user before, and now we don't, it means a logout happened
    if (previousUserRef.current && !user) {
      setItems([])
      localStorage.removeItem('udrcrafts_cart')
    }
    previousUserRef.current = user?.id
  }, [user])

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('udrcrafts_cart')
    if (saved) {
      try {
        setItems(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse cart')
      }
    }
  }, [])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // Save to local storage
  useEffect(() => {
    localStorage.setItem('udrcrafts_cart', JSON.stringify(items))
  }, [items])

  // Sync with the server on login: pull the persisted cart and merge any
  // guest items that were added before login, then push the merged cart
  // back so nothing is lost. The "Syncing cart…" indicator stays up until
  // the pull and the guest-item pushes finish.
  useEffect(() => {
    // Reset when there's no logged-in user — otherwise the indicator can
    // stay stuck if a mid-sync logout cancels the in-flight request
    if (!user) {
      setIsSyncing(false)
      return
    }

    let cancelled = false
    setIsSyncing(true)
    api
      .get(`${CART_API}/${user.id}`, { timeout: 4000 })
      .then((res) => {
        if (cancelled) return
        const serverItems = (Array.isArray(res.data) ? res.data : []).map(mapServerItem)

        // Merge: start from the server cart, append guest-only items
        const serverIds = new Set(serverItems.map((i) => i.productId))
        const merged: CartItem[] = [...serverItems]
        for (const local of itemsRef.current) {
          const existing = merged.find((m) => m.productId === local.productId)
          if (existing) {
            // Server quantity wins; fill any display fields missing locally
            if (!existing.image) existing.image = local.image
            if (!existing.currency) existing.currency = local.currency
          } else {
            merged.push(local)
          }
        }
        setItems(merged)

        // Persist only the guest-only items (server rows already have the
        // correct quantity — pushing them too could race with a concurrent
        // add). PUT sets absolute quantities, so it's idempotent.
        const pushes = merged
          .filter((item) => !serverIds.has(item.productId))
          .map((item) =>
            api.put(`${CART_API}/${user.id}/${item.productId}`, { quantity: item.quantity }, { timeout: 4000 })
          )
        return Promise.all(pushes)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Couldn't sync your saved cart. Changes may not be saved.", {
            id: 'cart-sync-error',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setIsSyncing(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // ── Best-effort server sync helpers (fire-and-forget, like wishlist) ──
  // A fixed toast id means repeated failures collapse into a single toast.
  const notifySyncFailed = () => {
    toast.error('Could not sync cart to server. Changes may not be saved.', {
      id: 'cart-sync-error',
    })
  }

  const syncAdd = (productId: string, quantity: number) => {
    if (user) {
      api.post(`${CART_API}`, { userId: user.id, productId, quantity }, { timeout: 4000 }).catch(notifySyncFailed)
    }
  }

  const syncUpdate = (productId: string, quantity: number) => {
    if (user) {
      api.put(`${CART_API}/${user.id}/${productId}`, { quantity }, { timeout: 4000 }).catch(notifySyncFailed)
    }
  }

  const syncRemove = (productId: string) => {
    if (user) {
      api.delete(`${CART_API}/${user.id}/${productId}`, { timeout: 4000 }).catch(notifySyncFailed)
    }
  }

  const syncClear = () => {
    if (user) {
      api.delete(`${CART_API}/${user.id}`, { timeout: 4000 }).catch(notifySyncFailed)
    }
  }

  /**
   * Push the entire local cart to the server (PUT sets absolute quantities,
   * creating any rows missing server-side) and return the persisted
   * CartItem ids. Used by checkout so the order is built from the server
   * cart (source of truth) rather than client-sent item data.
   */
  const flushCartToServer = async (): Promise<string[]> => {
    if (!user) return []
    const current = itemsRef.current
    if (current.length === 0) return []

    const results = await Promise.all(
      current.map((item) =>
        api
          .put(`${CART_API}/${user.id}/${item.productId}`, { quantity: item.quantity }, { timeout: 4000 })
          .then((res) => ({ productId: item.productId, id: res.data?.id }))
          .catch(() => ({ productId: item.productId, id: undefined }))
      )
    )

    // Only include ids that were actually persisted
    return results.filter((r) => r.id).map((r) => r.id)
  }

  const addItem = (item: Omit<CartItem, 'id'>) => {
    // Check using itemsRef to safely know the current state outside the updater
    const existing = itemsRef.current.find(i => i.productId === item.productId)
    if (existing) {
      trackCartEvent(item.productId, 'update', item.quantity)
    } else {
      trackCartEvent(item.productId, 'add', item.quantity)
    }

    setItems(prev => {
      const prevExisting = prev.find(i => i.productId === item.productId)
      if (prevExisting) {
        return prev.map(i =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        )
      }
      return [...prev, { ...item, id: Math.random().toString(36).substr(2, 9) }]
    })
    // Server sync — idempotent: increments the row or creates it
    syncAdd(item.productId, item.quantity)
  }

  const removeItem = (id: string) => {
    const item = items.find(i => i.id === id)
    if (item) {
      trackCartEvent(item.productId, 'remove', item.quantity)
    }
    setItems(prev => prev.filter(i => i.id !== id))
    if (item) syncRemove(item.productId)
  }

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id)
      return
    }
    const item = items.find(i => i.id === id)
    if (item && item.quantity !== quantity) {
      trackCartEvent(item.productId, 'update', quantity)
    }

    setItems(prev => {
      return prev.map(i => (i.id === id ? { ...i, quantity } : i))
    })
    if (item && item.quantity !== quantity) syncUpdate(item.productId, quantity)
  }

  const clearCart = () => {
    // Track removal for each item
    items.forEach(item => {
      trackCartEvent(item.productId, 'remove', item.quantity)
    })
    setItems([])
    syncClear()
  }

  /** Helper to fire cart tracking events only when user is logged in */
  const trackCartEvent = (productId: string, action: 'add' | 'remove' | 'update', quantity: number) => {
    if (user) {
      trackCart(user.id, productId, action, { quantity, source: 'cart_page' })
    }
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, isSyncing, flushCartToServer }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
