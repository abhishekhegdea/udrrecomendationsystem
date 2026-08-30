import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import api from '@/lib/api'
import { ProductCard } from './ProductCard'
import { getProductImageUrl } from '@/lib/utils'

const NODE_API = 'http://localhost:3001'
const FETCH_TIMEOUT_MS = 5000

interface RecommendationCarouselProps {
  title: string
  subtitle: string
  endpoint: string
}

/**
 * IMPORTANT:
 *
 * This interface deliberately matches the Product interface
 * expected by ProductCard.tsx.
 *
 * In particular:
 *
 * materials?: string[]
 *
 * rather than:
 *
 * materials?: unknown
 *
 * This fixes:
 *
 * Type 'RecommendationProduct' is not assignable to type 'Product'
 */
interface RecommendationProduct {
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

  score?: number
  click_rate_score?: number
  location_score?: number
  seller_distance_km?: number | null
  nearby_seller?: boolean
  location_priority_applied?: boolean

  [key: string]: unknown
}

/**
 * Raw product returned by:
 *
 * GET /api/products
 *
 * materials is intentionally unknown here because the backend
 * may return either:
 *
 * ["Wood", "Cotton"]
 *
 * or:
 *
 * "Wood,Cotton"
 *
 * We normalize it before passing it to ProductCard.
 */
interface NormalProduct {
  id: string
  name: string
  price: number

  currency?: string

  averageRating?: number
  reviewsCount?: number

  brand?: string
  description?: string

  materials?: unknown

  category?: {
    id?: string
    name?: string
  } | null

  seller?: {
    id?: string

    businessName?: string
    firstName?: string

    isNewSeller?: boolean
  } | null

  images?: Array<{
    id?: string
    url?: string
  }>
}

interface ProductsApiResponse {
  data?: NormalProduct[]

  meta?: {
    total?: number
    page?: number
    totalPages?: number
  }
}

/**
 * Convert any materials value received from the backend
 * into the exact string[] shape ProductCard expects.
 */
function normalizeMaterials(
  materials: unknown
): string[] | undefined {
  /**
   * Already an array.
   */
  if (Array.isArray(materials)) {
    const cleaned = materials
      .filter(
        (material): material is string =>
          typeof material === 'string'
      )
      .map((material) => material.trim())
      .filter(Boolean)

    return cleaned.length > 0
      ? cleaned
      : undefined
  }

  /**
   * Comma-separated string.
   */
  if (typeof materials === 'string') {
    const cleaned = materials
      .split(',')
      .map((material) => material.trim())
      .filter(Boolean)

    return cleaned.length > 0
      ? cleaned
      : undefined
  }

  return undefined
}

/**
 * RecommendationCarousel
 *
 * Preferred flow:
 *
 * Frontend
 *     ↓
 * Node recommendation proxy (:3001)
 *     ↓
 * Python recommendation engine (:8000)
 *     ↓
 * Personalized recommendations
 *
 *
 * Fallback:
 *
 * Recommendation API fails
 *     ↓
 * GET /api/products
 *     ↓
 * Real PostgreSQL products
 *
 *
 * IMPORTANT:
 *
 * There are NO hard-coded fake fallback products.
 *
 * This prevents invalid routes such as:
 *
 * /product/6
 *
 * when the real product IDs are UUIDs.
 */
export function RecommendationCarousel({
  title,
  subtitle,
  endpoint,
}: RecommendationCarouselProps) {
  const [products, setProducts] = useState<
    RecommendationProduct[]
  >([])

  const [loading, setLoading] =
    useState(true)

  const scrollRef =
    useRef<HTMLDivElement | null>(null)

  const [canScrollLeft, setCanScrollLeft] =
    useState(false)

  const [canScrollRight, setCanScrollRight] =
    useState(false)

  const [isDragging, setIsDragging] =
    useState(false)

  const dragStartX = useRef(0)
  const dragScrollLeft = useRef(0)

  const abortRef =
    useRef<AbortController | null>(null)

  const mountedRef = useRef(true)

  /**
   * ---------------------------------------------------------
   * SCROLL STATE
   * ---------------------------------------------------------
   */

  const checkScroll = useCallback(() => {
    const element = scrollRef.current

    if (!element) {
      return
    }

    setCanScrollLeft(
      element.scrollLeft > 4
    )

    setCanScrollRight(
      element.scrollLeft <
        element.scrollWidth -
          element.clientWidth -
          4
    )
  }, [])

  /**
   * ---------------------------------------------------------
   * SCROLL BUTTONS
   * ---------------------------------------------------------
   */

  const scrollBy = useCallback(
    (
      direction:
        | 'left'
        | 'right'
    ) => {
      const element = scrollRef.current

      if (!element) {
        return
      }

      const amount =
        direction === 'left'
          ? -element.clientWidth * 0.8
          : element.clientWidth * 0.8

      element.scrollBy({
        left: amount,
        behavior: 'smooth',
      })

      window.setTimeout(() => {
        if (mountedRef.current) {
          checkScroll()
        }
      }, 400)
    },
    [checkScroll]
  )

  /**
   * ---------------------------------------------------------
   * MOUSE DRAG
   * ---------------------------------------------------------
   */

  const handleMouseDown = useCallback(
    (
      event: MouseEvent<HTMLDivElement>
    ) => {
      const element = scrollRef.current

      if (!element) {
        return
      }

      setIsDragging(true)

      dragStartX.current =
        event.pageX -
        element.offsetLeft

      dragScrollLeft.current =
        element.scrollLeft

      element.style.cursor =
        'grabbing'

      element.style.userSelect =
        'none'
    },
    []
  )

  const handleMouseMove = useCallback(
    (
      event: MouseEvent<HTMLDivElement>
    ) => {
      if (
        !isDragging ||
        !scrollRef.current
      ) {
        return
      }

      event.preventDefault()

      const x =
        event.pageX -
        scrollRef.current.offsetLeft

      const movement =
        (x - dragStartX.current) *
        1.5

      scrollRef.current.scrollLeft =
        dragScrollLeft.current -
        movement
    },
    [isDragging]
  )

  const finishDragging = useCallback(() => {
    const element = scrollRef.current

    if (!element) {
      return
    }

    setIsDragging(false)

    element.style.cursor = ''
    element.style.userSelect = ''

    checkScroll()
  }, [checkScroll])

  /**
   * ---------------------------------------------------------
   * NORMAL PRODUCT → PRODUCTCARD PRODUCT
   * ---------------------------------------------------------
   */

  const convertNormalProduct =
    useCallback(
      (
        product: NormalProduct
      ): RecommendationProduct => {
        const rawImage =
          product.images?.[0]?.url

        return {
          id: product.id,

          name: product.name,

          price:
            Number(product.price) || 0,

          currency:
            product.currency || 'INR',

          averageRating:
            product.averageRating,

          reviewsCount:
            product.reviewsCount,

          brand:
            product.brand,

          description:
            product.description,

          /**
           * FIX:
           *
           * ProductCard expects string[].
           */
          materials:
            normalizeMaterials(
              product.materials
            ),

          categoryName:
            product.category?.name,

          seller_name:
            product.seller?.businessName ||
            product.seller?.firstName ||
            'UdrCrafts Seller',

          seller_new:
            Boolean(
              product.seller?.isNewSeller
            ),

          image: rawImage
            ? getProductImageUrl(
                rawImage
              )
            : undefined,

          explanation:
            'Popular product from the UdrCrafts marketplace.',
        }
      },
      []
    )

  /**
   * ---------------------------------------------------------
   * LOAD REAL FALLBACK PRODUCTS
   * ---------------------------------------------------------
   *
   * These are genuine database products.
   *
   * Therefore every displayed ProductCard gets a real
   * PostgreSQL product ID.
   */

  const loadRealFallbackProducts =
    useCallback(
      async (
        signal?: AbortSignal
      ) => {
        try {
          let sort = 'popular'

          if (
            endpoint.includes(
              'new-arrivals'
            )
          ) {
            sort = 'newest'
          }

          if (
            endpoint.includes(
              'trending'
            )
          ) {
            sort = 'popular'
          }

          const response =
            await api.get<ProductsApiResponse>(
              `${NODE_API}/api/products`,
              {
                params: {
                  page: 1,
                  limit: 12,
                  sort,
                },

                signal,

                timeout:
                  FETCH_TIMEOUT_MS,
              }
            )

          if (
            !mountedRef.current ||
            signal?.aborted
          ) {
            return
          }

          const rawProducts =
            response.data?.data

          if (
            !Array.isArray(
              rawProducts
            )
          ) {
            console.error(
              'Invalid /api/products response:',
              response.data
            )

            setProducts([])

            return
          }

          const converted =
            rawProducts
              .filter(
                (product) =>
                  typeof product.id ===
                    'string' &&
                  product.id.trim()
                    .length > 0
              )
              .map(
                convertNormalProduct
              )

          setProducts(converted)
        } catch (error) {
          if (signal?.aborted) {
            return
          }

          console.error(
            'Failed to load real fallback products:',
            error
          )

          if (mountedRef.current) {
            setProducts([])
          }
        }
      },
      [
        endpoint,
        convertNormalProduct,
      ]
    )

  /**
   * ---------------------------------------------------------
   * LOAD RECOMMENDATIONS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    mountedRef.current = true

    setProducts([])
    setLoading(true)

    abortRef.current?.abort()

    const controller =
      new AbortController()

    abortRef.current =
      controller

    const fetchRecommendations =
      async () => {
        try {
          const response =
            await api.get(
              `${NODE_API}/api/recommendations${endpoint}`,
              {
                signal:
                  controller.signal,

                timeout:
                  FETCH_TIMEOUT_MS,
              }
            )

          if (
            !mountedRef.current ||
            controller.signal.aborted
          ) {
            return
          }

          const responseData =
            response.data

          if (
            !responseData ||
            typeof responseData !==
              'object'
          ) {
            console.warn(
              `Invalid recommendation response for ${endpoint}. Using marketplace fallback.`
            )

            await loadRealFallbackProducts(
              controller.signal
            )

            return
          }

          const data =
            responseData as Record<
              string,
              unknown
            >

          /**
           * Different recommendation endpoints may return
           * arrays under different keys.
           *
           * Find the first array property.
           */
          const arrayKey =
            Object.keys(data).find(
              (key) =>
                Array.isArray(
                  data[key]
                )
            )

          if (!arrayKey) {
            console.warn(
              `Recommendation endpoint ${endpoint} did not contain a product array.`,
              data
            )

            await loadRealFallbackProducts(
              controller.signal
            )

            return
          }

          const rawItems =
            data[arrayKey]

          if (
            !Array.isArray(rawItems)
          ) {
            await loadRealFallbackProducts(
              controller.signal
            )

            return
          }

          /**
           * Recommendation engine can validly return zero
           * recommendations for a new user.
           */
          if (
            rawItems.length === 0
          ) {
            await loadRealFallbackProducts(
              controller.signal
            )

            return
          }

          const globalExplanation =
            typeof data.explanation ===
            'string'
              ? data.explanation
              : undefined

          /**
           * Normalize and validate recommendation products.
           */
          const validProducts:
            RecommendationProduct[] =
            rawItems
              .filter(
                (
                  item
                ): item is Record<
                  string,
                  unknown
                > =>
                  item !== null &&
                  typeof item ===
                    'object'
              )
              .filter((item) => {
                return (
                  typeof item.id ===
                    'string' &&
                  item.id.trim()
                    .length > 0 &&
                  typeof item.name ===
                    'string'
                )
              })
              .map((item) => {
                const materials =
                  normalizeMaterials(
                    item.materials
                  )

                return {
                  ...item,

                  id:
                    String(item.id),

                  name:
                    String(item.name),

                  price:
                    Number(
                      item.price
                    ) || 0,

                  currency:
                    typeof item.currency ===
                    'string'
                      ? item.currency
                      : 'INR',

                  seller_name:
                    typeof item.seller_name ===
                    'string'
                      ? item.seller_name
                      : undefined,

                  seller_new:
                    Boolean(
                      item.seller_new
                    ),

                  brand:
                    typeof item.brand ===
                    'string'
                      ? item.brand
                      : undefined,

                  image:
                    typeof item.image ===
                    'string'
                      ? getProductImageUrl(
                          item.image
                        )
                      : undefined,

                  explanation:
                    typeof item.explanation ===
                    'string'
                      ? item.explanation
                      : globalExplanation,

                  averageRating:
                    typeof item.averageRating ===
                    'number'
                      ? item.averageRating
                      : undefined,

                  reviewsCount:
                    typeof item.reviewsCount ===
                    'number'
                      ? item.reviewsCount
                      : undefined,

                  description:
                    typeof item.description ===
                    'string'
                      ? item.description
                      : undefined,

                  materials,

                  categoryName:
                    typeof item.categoryName ===
                    'string'
                      ? item.categoryName
                      : undefined,

                  score:
                    typeof item.score ===
                    'number'
                      ? item.score
                      : undefined,

                  click_rate_score:
                    typeof item.click_rate_score ===
                    'number'
                      ? item.click_rate_score
                      : undefined,
                }
              })

          if (
            validProducts.length ===
            0
          ) {
            console.warn(
              `Recommendation endpoint ${endpoint} returned no valid products.`
            )

            await loadRealFallbackProducts(
              controller.signal
            )

            return
          }

          setProducts(
            validProducts
          )
        } catch (error) {
          /**
           * Request was deliberately cancelled when component
           * unmounted or endpoint changed.
           */
          if (
            controller.signal.aborted
          ) {
            return
          }

          console.warn(
            `Recommendation endpoint ${endpoint} is unavailable. Loading real marketplace products instead.`,
            error
          )

          await loadRealFallbackProducts(
            controller.signal
          )
        } finally {
          if (
            mountedRef.current &&
            !controller.signal.aborted
          ) {
            setLoading(false)
          }
        }
      }

    fetchRecommendations()

    return () => {
      controller.abort()
    }
  }, [
    endpoint,
    loadRealFallbackProducts,
  ])

  /**
   * ---------------------------------------------------------
   * SCROLL LISTENERS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const element =
      scrollRef.current

    if (!element) {
      return
    }

    const frame =
      window.requestAnimationFrame(
        () => checkScroll()
      )

    element.addEventListener(
      'scroll',
      checkScroll,
      {
        passive: true,
      }
    )

    window.addEventListener(
      'resize',
      checkScroll
    )

    return () => {
      window.cancelAnimationFrame(
        frame
      )

      element.removeEventListener(
        'scroll',
        checkScroll
      )

      window.removeEventListener(
        'resize',
        checkScroll
      )
    }
  }, [
    products,
    checkScroll,
  ])

  /**
   * No products and no active request:
   * hide the recommendation section.
   */
  if (
    !loading &&
    products.length === 0
  ) {
    return null
  }

  return (
    <section className="py-12 relative">
      <div className="container mx-auto px-4 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground">
              {title}
            </h2>

            <p className="text-muted-foreground mt-1 text-sm">
              {subtitle}
            </p>
          </div>

          {products.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  scrollBy('left')
                }
                disabled={
                  !canScrollLeft
                }
                className={`h-11 w-11 rounded-full flex items-center justify-center border transition-all shadow-sm ${
                  canScrollLeft
                    ? 'bg-card text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md border-border active:scale-95'
                    : 'bg-muted/40 text-muted-foreground/30 border-transparent cursor-not-allowed'
                }`}
                aria-label="Scroll recommendations left"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <button
                type="button"
                onClick={() =>
                  scrollBy('right')
                }
                disabled={
                  !canScrollRight
                }
                className={`h-11 w-11 rounded-full flex items-center justify-center border transition-all shadow-sm ${
                  canScrollRight
                    ? 'bg-card text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md border-border active:scale-95'
                    : 'bg-muted/40 text-muted-foreground/30 border-transparent cursor-not-allowed'
                }`}
                aria-label="Scroll recommendations right"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative group">
        {loading &&
        products.length === 0 ? (
          /**
           * Loading cards only.
           *
           * These aren't clickable and therefore do not use
           * fake product IDs.
           */
          <div className="container mx-auto px-4">
            <div className="flex gap-6 overflow-hidden">
              {Array.from({
                length: 5,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="w-[256px] min-w-[256px] h-[360px] rounded-2xl bg-muted animate-pulse"
                  />
                )
              )}
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollRef}
              onMouseDown={
                handleMouseDown
              }
              onMouseMove={
                handleMouseMove
              }
              onMouseUp={
                finishDragging
              }
              onMouseLeave={
                finishDragging
              }
              className="w-full overflow-x-auto pb-6 scrollbar-custom"
            >
              <div className="container mx-auto px-4">
                <div className="flex gap-6 w-max">
                  {products.map(
                    (product) => (
                      <div
                        key={
                          product.id
                        }
                        className="w-[256px] min-w-[256px] max-w-[256px] flex-shrink-0"
                      >
                        <ProductCard
                          product={
                            product
                          }
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-6 w-12 bg-gradient-to-l from-background via-background/70 to-transparent pointer-events-none" />
            )}
          </>
        )}
      </div>
    </section>
  )
}