import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/WishlistContext'
import { useQuickView } from '@/contexts/QuickViewContext'
import { trackWishlist } from '@/lib/track'
import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'
import { ArrowLeft, ShoppingBag, Heart } from 'lucide-react'
import api, { isCancel } from '@/lib/api'
import { useAbortSignal } from '@/hooks/useApiCall'
import { toast } from 'sonner'
import { FALLBACK_PRODUCT_IMAGE, formatCurrency, getProductImageUrl } from '@/lib/utils'
import { StarRating } from '@/components/ui/star-rating'

export function ProductDetailsPage() {
  const { id } = useParams()
  const { addItem } = useCart()
  const { user } = useAuth()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { removeRecentlyViewed } = useQuickView()

  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const pageLoadTime = useRef(Date.now())
  const scrollDepth = useRef(0)
  // Becomes true only when the product fetch succeeded — used to skip tracking
  // events for stale/deleted product links (tracking a view of a product that
  // doesn't exist just makes both event APIs return 500s).
  const loadedRef = useRef(false)

  const { getSignal, mountedRef } = useAbortSignal()

  // Track scroll depth in real-time
  useEffect(() => {
    const handleScroll = () => {
      const docEl = document.documentElement
      const scrolled = docEl.scrollTop / (docEl.scrollHeight - docEl.clientHeight)
      scrollDepth.current = Math.max(scrollDepth.current, Math.round(scrolled * 100))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Tracks a product view event to both Node.js events API (for analytics + UserBehaviour)
  // and the Python ML event tracker API (for immediate recommendation personalization).
  const trackProductView = (userId: string, productId: string, timeSpent: number, scrollDepth: number) => {
    const payload = {
      userId,
      productId,
      timeSpent,
      scrollDepth,
      source: 'product_details'
    }

    // Fire-and-forget to Node.js events API (creates ProductView + UserBehaviour)
    api.post('http://localhost:3001/api/events/view', payload).catch(() => {})

    // Fire-and-forget to Python ML event tracker (for immediate personalization)
    // Python CORS allows all origins, so direct calls work
    api.post('http://localhost:8000/api/v1/events/view', {
      user_id: userId,
      product_id: productId,
      time_spent: timeSpent,
      scroll_depth: scrollDepth,
      source: 'product_details'
    }).catch(() => {})
  }

  useEffect(() => {
    // Reset timer on product change
    pageLoadTime.current = Date.now()
    scrollDepth.current = 0
    loadedRef.current = false

    // 1. Fetch Product Data
    const fetchProduct = async () => {
      try {
        const res = await api.get(`http://localhost:3001/api/products/${id}`, { signal: getSignal() })
        if (mountedRef.current) {
          setProduct(res.data)
          loadedRef.current = true
        }
      } catch (err) {
        if (!isCancel(err) && mountedRef.current) {
          const status = (err as any)?.response?.status
          if (status === 404) {
            // Product no longer exists — the UI shows the "Product not found"
            // state (no error to log). Also drop it from the persisted
            // "Recently Viewed" list so the stale card stops re-linking here.
            if (id) removeRecentlyViewed(id)
          } else {
            console.error('Failed to load product', err)
          }
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    fetchProduct()

    return () => {
      // 2. On unmount/navigation — send actual time spent and scroll depth to BOTH APIs.
      //    Only when the product actually loaded (skip stale/deleted links).
      if (user && id && loadedRef.current) {
        const elapsed = Math.max(1, Math.round((Date.now() - pageLoadTime.current) / 1000))
        trackProductView(user.id, id, elapsed, scrollDepth.current)
      }
      getSignal()
    }
  }, [id, user, getSignal, mountedRef, removeRecentlyViewed])

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: displayImage,
      currency: product.currency
    })

    // ML Tracking for Add to Cart (CART event type for better signals)
    if (user) {
      api.post('http://localhost:3001/api/events/click', {
        userId: user.id,
        productId: product.id,
        source: 'product_details',
        elementClicked: 'add_to_cart_button'
      }).catch(() => {})
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center">Loading...</div>
  }

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Product not found</h2>
        <Link to="/" className="text-primary hover:underline">Return to Home</Link>
      </div>
    )
  }

  const getFallbackImage = (name: string) => {
    const n = name.toLowerCase()
    if (n.includes('vase') || n.includes('pottery')) return '/products/product-vase.jpg'
    if (n.includes('shawl') || n.includes('pashmina')) return '/products/product-scarf.jpg'
    if (n.includes('box') || n.includes('wood')) return '/products/product-box.jpg'
    if (n.includes('lamp') || n.includes('brass')) return '/products/product-lamp.jpg'
    return FALLBACK_PRODUCT_IMAGE
  }

  const displayImage = getProductImageUrl(
    product.images?.[0]?.url,
    getFallbackImage(product.name || '')
  )

  const inWishlist = isInWishlist(product.id)

  const handleAddToWishlist = async () => {
    if (!user) {
      toast('Please login to save items to your wishlist')
      return
    }
    const wasInWishlist = isInWishlist(product.id)
    // Optimistic update via WishlistContext (mirrors ProductCard behaviour)
    await toggleWishlist(product.id)
    if (mountedRef.current) {
      toast.success(wasInWishlist ? 'Removed from Wishlist' : 'Added to Wishlist!')
    }
    // Feed the recommendation engine with a WISHLIST signal
    trackWishlist(user.id, product.id, wasInWishlist ? 'remove' : 'add', {
      source: 'product_details'
    })
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to Shop
      </Link>
      
      <div className="grid md:grid-cols-2 gap-12">
        {/* Images */}
        <div className="rounded-3xl overflow-hidden bg-muted aspect-square">
          <img
            src={displayImage}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = getFallbackImage(product.name || '')
            }}
          />
        </div>
        
        {/* Details */}
        <div className="flex flex-col justify-center">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-1 bg-muted rounded-md text-muted-foreground uppercase tracking-wider">
              {product.category?.name || 'Artisan Craft'}
            </span>
            {product.seller?.isNewSeller && (
              <span className="text-xs font-bold px-2 py-1 bg-primary text-primary-foreground rounded-md">
                New Artisan
              </span>
            )}
          </div>
          
          <h1 className="text-4xl font-display font-bold text-foreground leading-tight mb-2">
            {product.name}
          </h1>
          
          <p className="text-2xl text-primary font-semibold mb-4">{formatCurrency(product.price, product.currency)}</p>

          {/* Rating Display */}
          {(product.averageRating ?? 0) > 0 && (
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
              <StarRating rating={product.averageRating} size="md" />
              <span className="text-lg font-bold text-amber-600">{product.averageRating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">
                ({product.reviewsCount?.toLocaleString() || 0} {product.reviewsCount === 1 ? 'review' : 'reviews'})
              </span>
            </div>
          )}
          
          <div className="prose prose-sm mb-8 text-muted-foreground">
            <p>{product.description}</p>
          </div>
          
          {product.materials && product.materials.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-foreground mb-3">Materials</h3>
              <div className="flex gap-2 flex-wrap">
                {product.materials.map((m: string) => (
                  <span key={m} className="px-3 py-1 bg-muted text-muted-foreground text-sm rounded-full">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="flex gap-4">
            <button 
              onClick={handleAddToCart}
              className="flex-1 py-4 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 text-lg shadow-lg"
            >
              <ShoppingBag className="h-5 w-5" />
              Add to Cart
            </button>
            <button
              onClick={handleAddToWishlist}
              className={`w-16 flex items-center justify-center rounded-xl transition-colors border border-border shadow-sm ${
                inWishlist
                  ? 'bg-red-50 text-red-500 hover:bg-red-100'
                  : 'bg-muted text-muted-foreground hover:text-red-500'
              }`}
              title={inWishlist ? 'Remove from Wishlist' : 'Save to Wishlist'}
            >
              <Heart className={`h-6 w-6 ${inWishlist ? 'fill-red-500' : ''}`} />
            </button>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                 <img src={`https://ui-avatars.com/api/?name=${product.seller?.businessName || 'S'}&background=random`} alt="Seller" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Crafted by</p>
                <p className="font-semibold text-foreground">{product.seller?.businessName || 'Local Artisan'}</p>
              </div>
            </div>
            {product.brand && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Brand:</span>
                <span className="font-medium text-foreground">{product.brand}</span>
              </div>
            )}
            {product.etsyUrl && (
              <a 
                href={product.etsyUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View on Etsy ↗
              </a>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-20 space-y-12">
        <RecommendationCarousel 
          title="Customers Who Bought This Also Bought" 
          subtitle="Frequently purchased together by other customers."
          endpoint={`/also-bought/${product.id}`} 
        />

        <RecommendationCarousel 
          title="Similar Products" 
          subtitle="Explore other items with similar styles and materials."
          endpoint={`/product/${product.id}`} 
        />
      </div>
    </div>
  )
}
