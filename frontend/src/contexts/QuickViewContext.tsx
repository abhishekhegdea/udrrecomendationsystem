import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { QuickViewModal } from '@/components/ui/QuickViewModal'

const STORAGE_KEY = 'udrcrafts_recently_viewed'
const MAX_RECENTLY_VIEWED = 20

interface QuickViewProduct {
  id: string
  name: string
  price: number
  currency?: string
  image?: string
  brand?: string
  seller_name?: string
  averageRating?: number
  reviewsCount?: number
  description?: string
  materials?: string[]
  categoryName?: string
}

interface QuickViewContextType {
  openQuickView: (product: QuickViewProduct) => void
  closeQuickView: () => void
  recentlyViewed: QuickViewProduct[]
  removeRecentlyViewed: (productId: string) => void
}

const QuickViewContext = createContext<QuickViewContextType | undefined>(undefined)

function loadRecentlyViewed(): QuickViewProduct[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveRecentlyViewed(products: QuickViewProduct[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products.slice(0, MAX_RECENTLY_VIEWED)))
  } catch {
    // localStorage full or unavailable
  }
}

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<QuickViewProduct | null>(null)
  const [open, setOpen] = useState(false)
  const [recentlyViewed, setRecentlyViewed] = useState<QuickViewProduct[]>(loadRecentlyViewed)

  const openQuickView = useCallback((product: QuickViewProduct) => {
    setProduct(product)
    setOpen(true)

    // Track recently viewed
    setRecentlyViewed(prev => {
      const filtered = prev.filter(p => p.id !== product.id)
      const updated = [product, ...filtered].slice(0, MAX_RECENTLY_VIEWED)
      saveRecentlyViewed(updated)
      return updated
    })
  }, [])

  const closeQuickView = useCallback(() => {
    setOpen(false)
    setTimeout(() => setProduct(null), 300)
  }, [])

  // Drop a product from the persisted recently-viewed list. Used when a
  // product page 404s (the listing was deleted) so the stale card stops
  // showing on the home page and re-triggering the dead link.
  const removeRecentlyViewed = useCallback((productId: string) => {
    setRecentlyViewed(prev => {
      const filtered = prev.filter(p => p.id !== productId)
      if (filtered.length !== prev.length) {
        saveRecentlyViewed(filtered)
        return filtered
      }
      return prev
    })
  }, [])

  return (
    <QuickViewContext.Provider value={{ openQuickView, closeQuickView, recentlyViewed, removeRecentlyViewed }}>
      {children}
      <QuickViewModal product={product} open={open} onClose={closeQuickView} />
    </QuickViewContext.Provider>
  )
}

export function useQuickView() {
  const context = useContext(QuickViewContext)
  if (!context) {
    throw new Error('useQuickView must be used within a QuickViewProvider')
  }
  return context
}
