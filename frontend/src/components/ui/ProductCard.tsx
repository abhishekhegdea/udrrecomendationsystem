import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShoppingBag, Eye, MapPin } from 'lucide-react'

import { useWishlist } from '@/contexts/WishlistContext'
import { useCart } from '@/contexts/CartContext'
import { useQuickView } from '@/contexts/QuickViewContext'
import { useAuth } from '@/contexts/AuthContext'

import {
  FALLBACK_PRODUCT_IMAGE,
  formatCurrency,
  getProductImageUrl,
} from '@/lib/utils'

import { StarRating } from '@/components/ui/star-rating'
import { trackClick, trackWishlist } from '@/lib/track'

interface Product {
  id: string
  name: string
  price: number
  seller_name?: string
  seller_new?: boolean
  brand?: string
  image?: string
  currency?: string
  explanation?: string
  averageRating?: number
  reviewsCount?: number
  description?: string
  materials?: string[]
  categoryName?: string
  seller_distance_km?: number | null
  nearby_seller?: boolean
  location_priority_applied?: boolean
}

export function ProductCard({
  product,
}: {
  product: Product
}) {
  const [imageLoaded, setImageLoaded] = useState(false)

  const { user } = useAuth()
  const { toggleWishlist, isInWishlist } = useWishlist()
  const { addItem } = useCart()
  const { openQuickView } = useQuickView()

  const inWishlist = isInWishlist(product.id)

  const safeImage = getProductImageUrl(product.image)

  // -----------------------------------------------------------------------
  // Actual product-card click
  // -----------------------------------------------------------------------

  const handleProductClick = () => {
    trackClick(
      user?.id ?? null,
      product.id,
      {
        source: 'product_card',
        elementClicked: 'product_card',
      }
    )
  }

  // -----------------------------------------------------------------------
  // Wishlist
  // -----------------------------------------------------------------------

  const handleWishlist = (
    e: React.MouseEvent
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const wasInWishlist = inWishlist

    toggleWishlist(product.id)

    if (user) {
      trackWishlist(
        user.id,
        product.id,
        wasInWishlist ? 'remove' : 'add',
        {
          source: 'product_card',
        }
      )
    }
  }

  // -----------------------------------------------------------------------
  // Add to cart
  // -----------------------------------------------------------------------

  const handleAddToCart = (
    e: React.MouseEvent
  ) => {
    e.preventDefault()
    e.stopPropagation()

    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: safeImage,
      currency: product.currency,
    })

    /*
     * We can continue storing this in ClickEvent/UserBehaviour for analytics,
     * but the Node endpoint will NOT insert it into ProductClickHistory.
     *
     * Therefore Add to Cart does not artificially increase click-rate.
     */
    if (user) {
      trackClick(
        user.id,
        product.id,
        {
          source: 'product_card',
          elementClicked: 'add_to_cart_button',
        }
      )
    }
  }

  // -----------------------------------------------------------------------
  // Quick View
  // -----------------------------------------------------------------------

  const handleQuickView = (
    e: React.MouseEvent
  ) => {
    e.preventDefault()
    e.stopPropagation()

    openQuickView({
      id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      image: safeImage,
      brand: product.brand,
      seller_name: product.seller_name,
      averageRating: product.averageRating,
      reviewsCount: product.reviewsCount,
      description: product.description,
      materials: product.materials,
      categoryName: product.categoryName,
    })

    /*
     * Quick View is genuine product discovery, so it DOES count toward
     * ProductClickHistory.
     *
     * Guest clicks are also allowed because ProductClickHistory.userId
     * is nullable.
     */
    trackClick(
      user?.id ?? null,
      product.id,
      {
        source: 'product_card',
        elementClicked: 'quick_view_button',
      }
    )
  }

  return (
    <Link
      to={`/product/${product.id}`}
      onClick={handleProductClick}
      className="
        group
        block
        w-full
        h-full
        relative
        overflow-hidden
        rounded-2xl
        bg-card
        border
        border-border
        shadow-sm
        hover:shadow-lg
        transition-all
        flex
        flex-col
      "
    >
      {/* Image Container */}
      <div
        className="
          relative
          aspect-square
          rounded-2xl
          overflow-hidden
          bg-muted
          border
          border-border
        "
      >
        {safeImage ? (
          <>
            {!imageLoaded && (
              <div
                className="
                  absolute
                  inset-0
                  bg-muted
                  animate-pulse
                "
              />
            )}

            <img
              src={safeImage}
              alt={product.name}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              className={`
                w-full
                h-full
                object-cover
                transition-all
                duration-500
                group-hover:scale-105
                ${
                  imageLoaded
                    ? 'opacity-100 blur-0'
                    : 'opacity-0 blur-sm'
                }
              `}
              onError={(e) => {
                ;(e.target as HTMLImageElement).src =
                  FALLBACK_PRODUCT_IMAGE
              }}
            />
          </>
        ) : (
          <div
            className="
              w-full
              h-full
              flex
              items-center
              justify-center
              bg-sand
              text-clay
              grain
            "
          >
            <span className="text-sm font-medium">
              No Image
            </span>
          </div>
        )}

        {/* Nearby seller badge */}
        {product.nearby_seller &&
          typeof product.seller_distance_km === 'number' && (
            <div
              className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-md text-foreground text-[10px] font-semibold px-2 py-1 rounded-full shadow-sm z-10 flex items-center gap-1 border border-border/60"
            >
              <MapPin className="h-3 w-3 text-primary" />
              {product.seller_distance_km < 1
                ? `${Math.max(1, Math.round(product.seller_distance_km * 1000))} m away`
                : `${product.seller_distance_km.toFixed(1)} km away`}
            </div>
          )}

        {/* New seller badge */}
        {product.seller_new && (
          <div
            className="
              absolute
              top-3
              left-3
              bg-accent
              text-accent-foreground
              text-[10px]
              font-bold
              px-2
              py-1
              rounded-full
              uppercase
              tracking-wider
              shadow-sm
              z-10
            "
          >
            New Artisan
          </div>
        )}

        {/* Quick View */}
        <div
          className="
            absolute
            inset-0
            flex
            items-center
            justify-center
            opacity-0
            group-hover:opacity-100
            transition-opacity
            duration-300
            z-10
          "
        >
          <button
            onClick={handleQuickView}
            className="
              px-5
              py-2.5
              bg-background/90
              backdrop-blur-md
              text-foreground
              font-semibold
              rounded-full
              text-xs
              shadow-lg
              hover:bg-background
              hover:scale-105
              transition-all
              flex
              items-center
              gap-2
              border
              border-border/50
            "
          >
            <Eye className="h-4 w-4" />

            Quick View
          </button>
        </div>

        {/* Wishlist */}
        <button
          onClick={handleWishlist}
          className="
            absolute
            top-3
            right-3
            p-2
            bg-background/80
            backdrop-blur-md
            rounded-full
            shadow-sm
            hover:bg-background
            transition-colors
            z-20
            group/btn
          "
        >
          <Heart
            className={`
              h-4
              w-4
              transition-colors
              ${
                inWishlist
                  ? 'fill-red-500 text-red-500'
                  : 'text-muted-foreground group-hover/btn:text-red-500'
              }
            `}
          />
        </button>
      </div>

      {/* Details */}
      <div className="mt-4 space-y-1">
        <div className="flex justify-between items-start">
          <h3
            className="
              text-sm
              font-semibold
              text-foreground
              truncate
              pr-2
            "
          >
            {product.name}
          </h3>

          <p
            className="
              text-sm
              font-bold
              text-primary
            "
          >
            {formatCurrency(
              product.price,
              product.currency
            )}
          </p>
        </div>

        <p
          className="
            text-xs
            text-muted-foreground
            truncate
          "
        >
          {product.brand ? (
            <span
              className="
                hover:text-primary
                transition-colors
                cursor-pointer
              "
            >
              {product.brand}
            </span>
          ) : (
            <>
              By{' '}
              <span
                className="
                  hover:text-primary
                  transition-colors
                  cursor-pointer
                "
              >
                {product.seller_name ||
                  'UdrCrafts Artisan'}
              </span>
            </>
          )}
        </p>

        {(product.averageRating ?? 0) > 0 && (
          <div
            className="
              flex
              items-center
              gap-2
              mt-1
            "
          >
            <StarRating
              rating={product.averageRating!}
              size="sm"
            />

            <span
              className="
                text-[11px]
                font-medium
                text-amber-600
              "
            >
              {product.averageRating!.toFixed(1)}
            </span>

            {product.reviewsCount &&
              product.reviewsCount > 0 && (
                <span
                  className="
                    text-[10px]
                    text-muted-foreground
                  "
                >
                  ({product.reviewsCount})
                </span>
              )}
          </div>
        )}

        {product.explanation && (
          <div
            className="
              mt-2
              pt-2
              border-t
              border-border
            "
          >
            <p
              className="
                text-[10px]
                text-muted-foreground
                italic
                leading-tight
              "
            >
              ✨ {product.explanation}
            </p>
          </div>
        )}

        <button
          onClick={handleAddToCart}
          className="
            w-full
            mt-3
            py-2
            bg-primary/10
            text-primary
            font-semibold
            rounded-lg
            text-xs
            hover:bg-primary
            hover:text-primary-foreground
            transition-colors
            flex
            items-center
            justify-center
            gap-2
            opacity-0
            group-hover:opacity-100
            focus:opacity-100
          "
        >
          <ShoppingBag className="h-3 w-3" />

          Add to Cart
        </button>
      </div>
    </Link>
  )
}