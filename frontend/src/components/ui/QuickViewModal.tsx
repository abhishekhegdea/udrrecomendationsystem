import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShoppingBag, Heart, Eye, Minus, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCart } from '@/contexts/CartContext'
import { useWishlist } from '@/contexts/WishlistContext'
import { useAuth } from '@/contexts/AuthContext'
import { FALLBACK_PRODUCT_IMAGE, formatCurrency, getProductImageUrl } from '@/lib/utils'
import { StarRating } from '@/components/ui/star-rating'
import { toast } from 'sonner'
import api from '@/lib/api'
import { trackProductView, trackCart, trackWishlist, trackClick } from '@/lib/track'

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

interface QuickViewModalProps {
  product: QuickViewProduct | null
  open: boolean
  onClose: () => void
}

export function QuickViewModal({ product, open, onClose }: QuickViewModalProps) {
  const { user } = useAuth()
  const { addItem } = useCart()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const [quantity, setQuantity] = useState(1)
  const viewTrackedRef = useRef(false)
  const [fullProduct, setFullProduct] = useState<any>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%')
  const navigate = useNavigate()
  const imageContainerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Reset quantity, image index, and view-tracked flag when product changes
  useEffect(() => {
    setQuantity(1)
    setCurrentImageIndex(0)
    setImageLoaded(false)
    setIsZoomed(false)
    setZoomOrigin('50% 50%')
    viewTrackedRef.current = false
  }, [product?.id])

  const abortRef = useRef<AbortController | null>(null)

  // Fetch full product details for images, description, materials
  useEffect(() => {
    if (open && product?.id) {
      // Track PRODUCT_VIEW when modal opens (once per product)
      if (user && !viewTrackedRef.current) {
        viewTrackedRef.current = true
        trackProductView(user.id, product.id, {
          source: 'quick_view_modal'
        })
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      api.get(`http://localhost:3001/api/products/${product.id}`, { signal: controller.signal })
        .then(res => setFullProduct(res.data))
        .catch(() => {/* use card-level data */})
    }
    return () => abortRef.current?.abort()
  }, [open, product?.id, user])

  // Build images array from API data (sanitise placeholder URLs upfront)
  const images: string[] = []
  if (fullProduct?.images?.length > 0) {
    fullProduct.images.forEach((img: any) => {
      if (img.url) images.push(getProductImageUrl(img.url))
    })
  } else if (product?.image) {
    images.push(getProductImageUrl(product.image))
  }

  const totalImages = images.length

  // Reset zoom state so exit animations aren't conflicted
  const resetZoom = () => {
    setIsZoomed(false)
    setZoomOrigin('50% 50%')
  }

  // Plain functions (not useCallback) so they're hoisted and available to all useEffects
  const goToPrev = () => {
    resetZoom()
    setCurrentImageIndex(prev => (prev - 1 + totalImages) % Math.max(totalImages, 1))
  }

  const goToNext = () => {
    resetZoom()
    setCurrentImageIndex(prev => (prev + 1) % Math.max(totalImages, 1))
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev()
      if (e.key === 'ArrowRight') goToNext()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50
    if (Math.abs(diff) > threshold) {
      if (diff > 0) goToNext()
      else goToPrev()
    }
  }

  if (!product) return null

  const desc = fullProduct?.description || product.description || ''
  const materials = fullProduct?.materials || product.materials || []
  const inWishlist = isInWishlist(product.id)

  const handleAddToCart = () => {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity,
      image: images[0] || product.image,
      currency: product.currency
    })
    // Track CART event
    if (user) {
      trackCart(user.id, product.id, 'add', {
        quantity,
        source: 'quick_view_modal'
      })
      trackClick(user.id, product.id, {
        source: 'quick_view_modal',
        elementClicked: 'add_to_cart_button'
      })
    }
    toast.success(`Added ${quantity > 1 ? quantity + ' items' : 'item'} to cart`, {
      description: product.name,
      action: {
        label: 'View Cart',
        onClick: () => navigate('/cart')
      }
    })
    onClose()
  }

  const handleWishlist = () => {
    const isAdding = !inWishlist
    toggleWishlist(product.id)
    // Track WISHLIST event
    if (user) {
      trackWishlist(user.id, product.id, isAdding ? 'add' : 'remove', {
        source: 'quick_view_modal'
      })
    }
    if (isAdding) {
      toast.success('Added to Wishlist!', {
        description: product.name,
        action: {
          label: 'View Wishlist',
          onClick: () => navigate('/customer/wishlist')
        }
      })
    } else {
      toast('Removed from Wishlist', {
        description: product.name
      })
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="pointer-events-auto w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-background rounded-3xl shadow-2xl border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-20 p-2.5 bg-background/80 backdrop-blur-md rounded-full shadow-md hover:bg-background transition-colors border border-border"
                aria-label="Close quick view"
              >
                <X className="h-5 w-5 text-foreground" />
              </button>

              <div className="grid md:grid-cols-2 gap-0">
                {/* Left: Image Gallery */}
                <div className="flex flex-col bg-muted rounded-t-3xl md:rounded-l-3xl md:rounded-tr-none overflow-hidden">
                  {/* Main image */}
                  <div
                    ref={imageContainerRef}
                    className={`relative aspect-square md:aspect-[4/5] min-h-[280px] flex items-center justify-center overflow-hidden select-none ${
                      isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                    }`}
                    onTouchStart={totalImages > 1 ? handleTouchStart : undefined}
                    onTouchMove={totalImages > 1 ? handleTouchMove : undefined}
                    onTouchEnd={totalImages > 1 ? handleTouchEnd : undefined}
                    onMouseEnter={() => setIsZoomed(true)}
                    onMouseLeave={() => { setIsZoomed(false); setZoomOrigin('50% 50%') }}
                    onMouseMove={(e) => {
                      if (!imageContainerRef.current) return
                      const rect = imageContainerRef.current.getBoundingClientRect()
                      const x = ((e.clientX - rect.left) / rect.width) * 100
                      const y = ((e.clientY - rect.top) / rect.height) * 100
                      setZoomOrigin(`${x}% ${y}%`)
                    }}
                  >
                    {images.length > 0 ? (
                      <>
                        {/* Loading placeholder */}
                        {!imageLoaded && (
                          <div className="absolute inset-0 bg-muted animate-pulse" />
                        )}
                        <AnimatePresence mode="wait">
                          <motion.img
                            key={currentImageIndex}
                            src={images[currentImageIndex] || FALLBACK_PRODUCT_IMAGE}
                            alt={`${product.name} - Image ${currentImageIndex + 1}`}
                            loading="lazy"
                            onLoad={() => setImageLoaded(true)}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: imageLoaded ? 1 : 0.6, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.2 }}
                            className="w-full h-full object-cover absolute inset-0 transition-transform duration-75 ease-out will-change-transform"
                            style={{
                              transform: isZoomed ? 'scale(2.2)' : 'scale(1)',
                              transformOrigin: zoomOrigin,
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE
                            }}
                            draggable={false}
                          />
                        </AnimatePresence>

                        {/* Category badge */}
                        {product.categoryName && (
                          <span className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-background/80 backdrop-blur-md rounded-full text-[11px] font-bold text-foreground uppercase tracking-wider shadow-sm border border-border/50">
                            {product.categoryName}
                          </span>
                        )}

                        {/* Image counter badge */}
                        {totalImages > 1 && (
                          <span className="absolute bottom-4 right-4 z-10 px-2.5 py-1 bg-background/80 backdrop-blur-md rounded-full text-[11px] font-semibold text-muted-foreground shadow-sm border border-border/50">
                            {currentImageIndex + 1} / {totalImages}
                          </span>
                        )}

                        {/* Left arrow */}
                        {totalImages > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); goToPrev() }}
                            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-md flex items-center justify-center shadow-md hover:bg-background transition-colors md:opacity-0 md:hover:opacity-100 focus:opacity-100 border border-border/50"
                            aria-label="Previous image"
                          >
                            <ChevronLeft className="h-5 w-5 text-foreground" />
                          </button>
                        )}

                        {/* Right arrow */}
                        {totalImages > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); goToNext() }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-background/80 backdrop-blur-md flex items-center justify-center shadow-md hover:bg-background transition-colors md:opacity-0 md:hover:opacity-100 focus:opacity-100 border border-border/50"
                            aria-label="Next image"
                          >
                            <ChevronRight className="h-5 w-5 text-foreground" />
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Eye className="h-12 w-12 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>

                  {/* Thumbnail strip */}
                  {totalImages > 1 && (
                    <div className="flex gap-2 px-4 py-3 bg-muted/50 border-t border-border/50 overflow-x-auto hide-scrollbar">
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => { resetZoom(); setCurrentImageIndex(idx) }}
                          className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                            idx === currentImageIndex
                              ? 'border-primary ring-1 ring-primary/30 shadow-md scale-105'
                              : 'border-transparent opacity-60 hover:opacity-100 hover:border-muted-foreground/30'
                          }`}
                        >
                          <img
                            src={img}
                            alt={`Thumbnail ${idx + 1}`}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = FALLBACK_PRODUCT_IMAGE
                            }}
                            draggable={false}
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dot indicators (shown when no thumbnails on small screens) */}
                  {totalImages > 1 && (
                    <div className="md:hidden flex items-center justify-center gap-1.5 py-2 bg-muted/30">
                      {images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => { resetZoom(); setCurrentImageIndex(idx) }}
                          className={`w-1.5 h-1.5 rounded-full transition-all ${
                            idx === currentImageIndex
                              ? 'bg-primary w-4'
                              : 'bg-muted-foreground/30'
                          }`}
                          aria-label={`Go to image ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Details */}
                <div className="p-6 md:p-8 flex flex-col justify-between">
                  <div>
                    {/* Brand / Seller */}
                    <div className="mb-4">
                      {product.brand ? (
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {product.brand}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-1">
                          By <span className="font-medium">{product.seller_name || 'UdrCrafts Artisan'}</span>
                        </p>
                      )}
                    </div>

                    {/* Product Name */}
                    <h2 className="text-xl md:text-2xl font-display font-bold text-foreground leading-tight mb-3">
                      {product.name}
                    </h2>

                    {/* Price */}
                    <p className="text-2xl md:text-3xl font-bold text-primary mb-4">
                      {formatCurrency(product.price, product.currency)}
                    </p>

                    {/* Rating */}
                    {(product.averageRating ?? 0) > 0 && (
                      <div className="flex items-center gap-2 mb-5 pb-5 border-b border-border">
                        <StarRating rating={product.averageRating!} size="sm" />
                        <span className="text-sm font-medium text-amber-600">
                          {product.averageRating!.toFixed(1)}
                        </span>
                        {product.reviewsCount && product.reviewsCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({product.reviewsCount.toLocaleString()} {product.reviewsCount === 1 ? 'review' : 'reviews'})
                          </span>
                        )}
                      </div>
                    )}

                    {/* Description */}
                    {desc && (
                      <div className="mb-5">
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                          {desc}
                        </p>
                      </div>
                    )}

                    {/* Materials */}
                    {materials.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Materials
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {materials.map((m: string) => (
                            <span
                              key={m}
                              className="px-2.5 py-1 bg-muted text-muted-foreground text-[11px] rounded-full font-medium"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-3 pt-4 border-t border-border">
                    {/* Quantity selector */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Quantity</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setQuantity(q => Math.max(1, q - 1))}
                          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-foreground">{quantity}</span>
                        <button
                          onClick={() => setQuantity(q => Math.min(99, q + 1))}
                          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddToCart}
                        className="flex-1 h-12 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-primary/20 active:scale-[0.98]"
                      >
                        <ShoppingBag className="h-4 w-4" />
                        Add to Cart
                      </button>
                      <button
                        onClick={handleWishlist}
                        className={`w-12 h-12 rounded-xl border transition-all flex items-center justify-center flex-shrink-0 ${
                          inWishlist
                            ? 'bg-red-50 border-red-200 text-red-500'
                            : 'bg-muted border-border text-muted-foreground hover:text-red-500 hover:border-red-200'
                        }`}
                        aria-label="Toggle wishlist"
                      >
                        <Heart className={`h-4 w-4 ${inWishlist ? 'fill-red-500' : ''}`} />
                      </button>
                    </div>

                    {/* View full details */}
                    <Link
                      to={`/product/${product.id}`}
                      onClick={onClose}
                      className="block w-full text-center py-2.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors rounded-xl hover:bg-primary/5"
                    >
                      View Full Details →
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
