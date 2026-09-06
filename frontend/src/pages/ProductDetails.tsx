import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCart } from '@/contexts/CartContext'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/WishlistContext'
import { useQuickView } from '@/contexts/QuickViewContext'
import { trackWishlist } from '@/lib/track'
import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'
import { ArrowLeft, ShoppingBag, Heart, Minus, Plus, AlertCircle, CheckCircle2 } from 'lucide-react'
import api, { isCancel } from '@/lib/api'
import { useAbortSignal } from '@/hooks/useApiCall'
import { toast } from 'sonner'
import { formatCurrency, getProductImageUrl } from '@/lib/utils'
import { StarRating } from '@/components/ui/star-rating'

export function ProductDetailsPage() {
  const { id } = useParams()
  const { items, addItem } = useCart()
  const { user } = useAuth()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { removeRecentlyViewed } = useQuickView()

  const [product, setProduct] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const pageLoadTime = useRef(Date.now())
  const scrollDepth = useRef(0)
  // Becomes true only when the product fetch succeeded — used to skip tracking
  // events for stale/deleted product links (tracking a view of a product that
  // doesn't exist just makes both event APIs return 500s).
  const loadedRef = useRef(false)
  const [reviewsData, setReviewsData] = useState<any>(null)
  const [reviewsLoading, setReviewsLoading] = useState(true)

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

    // 2. Fetch Product Reviews & Rating Distribution
    const fetchReviews = async () => {
      if (!id) return
      setReviewsLoading(true)
      try {
        const res = await api.get(`http://localhost:3001/api/products/${id}/reviews`)
        if (mountedRef.current) {
          setReviewsData(res.data)
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (mountedRef.current) setReviewsLoading(false)
      }
    }
    fetchReviews()

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
    if (!product) return
    const inv = product.inventory !== undefined ? Number(product.inventory) : undefined
    const added = addItem({
      productId: product.id,
      name: product.name,
      price: finalPrice,
      quantity,
      image: displayImage,
      currency: product.currency,
      inventory: inv,
    })
    if (added) {
      toast.success(`Added ${quantity > 1 ? quantity + ' items' : 'item'} to cart!`)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground">Loading product...</div>
  }

  if (!product) {
    return (
      <div className="py-20 text-center space-y-4">
        <h2 className="text-2xl font-bold font-display">Product Not Found</h2>
        <p className="text-muted-foreground">The product you're looking for doesn't exist or has been removed.</p>
        <Link to="/search" className="inline-block px-6 py-2 bg-primary text-primary-foreground rounded-full font-semibold">
          Explore Products
        </Link>
      </div>
    )
  }

  const displayImage = getProductImageUrl(product.images?.[0]?.url)
  const discountRate = Number(product.discount ?? 0)
  const hasDiscount = discountRate > 0
  const finalPrice = hasDiscount
    ? Math.max(0, product.price * (1 - discountRate / 100))
    : product.price

  const totalReviews = reviewsData?.distribution?.total || product.reviewsCount || 0
  const avgRating = reviewsData?.distribution?.averageRating || product.averageRating || 0

  const inv = product.inventory !== undefined ? Number(product.inventory) : 0
  const isOutOfStock = inv <= 0
  const inCartItem = items.find((i) => i.productId === product.id)
  const currentInCart = inCartItem?.quantity || 0
  const remainingStock = Math.max(0, inv - currentInCart)
  const isCartMaxed = inv > 0 && currentInCart >= inv

  const inWishlist = isInWishlist(product.id)

  const handleAddToWishlist = () => {
    const wasInWishlist = inWishlist
    toggleWishlist(product.id)
    if (user) {
      trackWishlist(user.id, product.id, wasInWishlist ? 'remove' : 'add', {
        source: 'product_details',
      })
    }
  }

  return (
    <div className="space-y-12">
      <Link to="/search" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Product Images */}
        <div className="space-y-4">
          <div className="aspect-square bg-muted rounded-3xl overflow-hidden border border-border">
            {displayImage ? (
              <img src={displayImage} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-sand flex items-center justify-center text-clay">
                No Image Available
              </div>
            )}
          </div>
          {product.images?.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {product.images.map((img: any) => (
                <div key={img.id} className="h-20 w-20 bg-muted rounded-xl overflow-hidden border border-border flex-shrink-0 cursor-pointer">
                  <img src={getProductImageUrl(img.url)} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {product.category?.name || 'Handcrafted'}
              </span>
              {product.subcategory?.name && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {product.subcategory.name}
                  </span>
                </>
              )}
            </div>
            
            <h1 className="text-3xl font-bold font-display text-foreground">{product.name}</h1>
            
            {product.seller?.isNewSeller && (
              <span className="inline-block mt-2 px-3 py-1 bg-accent text-accent-foreground text-xs font-bold rounded-full uppercase tracking-wider">
                New Artisan
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-primary">
              {formatCurrency(finalPrice, product.currency)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-lg text-muted-foreground line-through font-medium">
                  {formatCurrency(product.price, product.currency)}
                </span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-900">
                  Save {discountRate}%
                </span>
              </>
            )}
          </div>

          {/* Real-time Inventory & Fulfillment Status */}
          <div className="flex items-center gap-2 pt-1">
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-3.5 w-3.5" /> Currently Out of Stock
              </span>
            ) : inv <= 2 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <AlertCircle className="h-3.5 w-3.5" /> Only {inv} left in stock — order soon!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" /> In stock ({inv} units available)
              </span>
            )}

            {currentInCart > 0 && (
              <span className="text-xs text-muted-foreground font-medium">
                ({currentInCart} in cart)
              </span>
            )}
          </div>

          <p className="text-muted-foreground leading-relaxed">{product.description}</p>

          {product.materials && product.materials.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Materials</h3>
              <div className="flex flex-wrap gap-2">
                {product.materials.map((mat: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                    {mat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rating Snapshot */}
          <div className="flex items-center gap-3 pt-2">
            <StarRating rating={avgRating} size="md" />
            <span className="text-sm font-bold text-amber-600">
              {avgRating > 0 ? avgRating.toFixed(1) : 'New'}
            </span>
            <span className="text-sm text-muted-foreground">
              ({totalReviews.toLocaleString()} {totalReviews === 1 ? 'review' : 'reviews'})
            </span>
          </div>

          {/* Quantity Stepper (if in stock) */}
          {!isOutOfStock && !isCartMaxed && (
            <div className="flex items-center gap-4 pt-3">
              <span className="text-sm font-semibold text-foreground">Quantity</span>
              <div className="flex items-center border border-border rounded-xl bg-card shadow-sm">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-3.5 py-2 text-foreground hover:bg-muted rounded-l-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-4 py-2 font-bold text-sm min-w-[2.5rem] text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(remainingStock, q + 1))}
                  disabled={quantity >= remainingStock}
                  className="px-3.5 py-2 text-foreground hover:bg-muted rounded-r-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {remainingStock < 5 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  Max {remainingStock} can be added
                </span>
              )}
            </div>
          )}

          {isCartMaxed && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-xl">
              ⚠️ You have reached the maximum available inventory ({inv} units) for this item in your cart.
            </p>
          )}

          <div className="flex gap-4 pt-2">
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || isCartMaxed}
              className="flex-1 h-12 bg-primary text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBag className="h-5 w-5" />
              {isOutOfStock ? 'Out of Stock' : isCartMaxed ? 'Max in Cart' : 'Add to Cart'}
            </button>
            <button
              onClick={handleAddToWishlist}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-colors border ${
                inWishlist
                  ? 'bg-red-50 border-red-200 text-red-500'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Heart className={`h-5 w-5 ${inWishlist ? 'fill-red-500' : ''}`} />
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-border flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                   <img src={`https://ui-avatars.com/api/?name=${product.seller?.businessName || 'S'}&background=random`} alt="Seller" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Crafted by</p>
                  <p className="font-semibold text-foreground">{product.seller?.businessName || 'Local Artisan'}</p>
                </div>
              </div>
              {product.seller?.trustBadge && (
                <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shadow-sm">
                  {product.seller.trustBadge}
                </span>
              )}
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
      
      {/* Customer Reviews & Star Distribution Section */}
      <div className="mt-16 pt-10 border-t border-border space-y-8">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h2 className="text-2xl font-bold font-display text-foreground">Customer Reviews & Ratings</h2>
            <p className="text-sm text-muted-foreground mt-1">Verified feedback from customers who received this handcrafted item.</p>
          </div>
          {user && (
            <Link
              to="/customer"
              className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-xs font-semibold text-foreground border border-border transition-colors self-start md:self-auto"
            >
              Review Delivered Orders →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* Rating Breakdown Card */}
          <div className="p-6 bg-muted/40 rounded-3xl border border-border space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-extrabold text-foreground font-display">
                {avgRating > 0 ? avgRating.toFixed(1) : '—'}
              </span>
              <div>
                <StarRating rating={avgRating} size="sm" />
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {totalReviews.toLocaleString()} ratings
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border/50">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviewsData?.distribution?.[star] || 0
                const percent = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-10 font-semibold text-muted-foreground flex items-center gap-1">
                      {star} ★
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-medium text-muted-foreground">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reviews List */}
          <div className="md:col-span-2 space-y-4">
            {reviewsLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading customer reviews...</div>
            ) : reviewsData?.reviews?.length > 0 ? (
              <div className="space-y-4">
                {reviewsData.reviews.map((rev: any) => (
                  <div key={rev.id} className="p-5 bg-card rounded-2xl border border-border space-y-2.5 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {rev.user?.firstName?.[0] || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">
                            {rev.user?.firstName ? `${rev.user.firstName} ${rev.user.lastName || ''}` : 'Verified Customer'}
                          </p>
                          <span className="inline-block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                            ✓ Verified Delivery
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <StarRating rating={rev.rating || 5} size="sm" />
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {rev.text && (
                      <p className="text-sm text-foreground/90 leading-relaxed pt-1">
                        "{rev.text}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-muted/20 rounded-3xl border border-dashed border-border text-muted-foreground space-y-2">
                <p className="text-sm font-semibold">No detailed written reviews yet.</p>
                <p className="text-xs">Have you received this item? Visit your customer dashboard to share your experience!</p>
              </div>
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
