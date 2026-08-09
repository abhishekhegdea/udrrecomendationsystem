import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Loader2 } from 'lucide-react'
import { useWishlist } from '@/contexts/WishlistContext'
import { ProductCard } from '@/components/ui/ProductCard'
import api from '@/lib/api'
import { getProductImageUrl } from '@/lib/utils'

export function WishlistPage() {
  const { items } = useWishlist()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    const productIds = items.map(i => i.productId)
    if (productIds.length === 0) {
      setProducts([])
      setLoading(false)
      return
    }

    setLoading(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Fetch all products in parallel; skip individual failures
    const fetchAll = async () => {
      const fetches = productIds.map(id =>
        api.get(`http://localhost:3001/api/products/${id}`, {
          signal: controller.signal,
          timeout: 4000,
        }).then(r => r.data).catch(() => null)
      )
      const results = (await Promise.all(fetches)).filter(Boolean)
      if (mountedRef.current) {
        setProducts(results)
        setLoading(false)
      }
    }

    fetchAll()

    return () => {
      mountedRef.current = false
      controller.abort()
    }
  }, [items])

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl min-h-[60vh]">
      <h1 className="text-3xl font-display font-bold text-foreground mb-2">My Wishlist</h1>
      <p className="text-muted-foreground mb-8">{items.length} saved {items.length === 1 ? 'item' : 'items'}</p>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 bg-muted/50 rounded-3xl border border-border">
          <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground mb-2">Your wishlist is empty</h3>
          <p className="text-muted-foreground mb-6">Discover beautiful handcrafted items and save them here.</p>
          <Link 
            to="/"
            className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors inline-block"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product: any) => {
            const cardProduct = {
              id: product.id,
              name: product.name || 'Untitled Product',
              price: product.price || 0,
              seller_name: product.seller?.businessName || product.seller?.firstName || 'Artisan',
              seller_new: product.seller?.isNewSeller,
              image: getProductImageUrl(product.images?.[0]?.url)
            }
            return <ProductCard key={product.id} product={cardProduct} />
          })}
        </div>
      )}
    </div>
  )
}
