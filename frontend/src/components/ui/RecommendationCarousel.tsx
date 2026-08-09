import { useEffect, useState, useRef, useCallback } from 'react'
import api from '@/lib/api'
import { ProductCard } from './ProductCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const FETCH_TIMEOUT_MS = 3000

interface RecommendationCarouselProps {
  title: string;
  subtitle: string;
  endpoint: string;
}

const FALLBACK_PRODUCTS = [
  { id: '1', name: 'Jaipur Blue Pottery Vase', price: 1200, seller_name: 'Meera Studio', seller_new: true, image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=600&auto=format&fit=crop' },
  { id: '2', name: 'Handwoven Pashmina Shawl', price: 4500, seller_name: 'Kashmir Looms', seller_new: false, image: 'https://images.unsplash.com/photo-1620799140188-3b2a02fd9a77?q=80&w=600&auto=format&fit=crop' },
  { id: '3', name: 'Carved Teakwood Box', price: 850, seller_name: 'Rao Craftworks', seller_new: true, image: 'https://images.unsplash.com/photo-1590740685955-442882a4d62c?q=80&w=600&auto=format&fit=crop' },
  { id: '4', name: 'Brass Vintage Lamp', price: 2100, seller_name: 'Moradabad Metals', seller_new: false, image: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?q=80&w=600&auto=format&fit=crop' },
  { id: '5', name: 'Terracotta Planters', price: 400, seller_name: 'Village Clay Arts', seller_new: true, image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=600&auto=format&fit=crop' },
  { id: '6', name: 'Madhubani Canvas Painting', price: 3200, seller_name: 'Artisan Heritage', seller_new: false, image: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600&auto=format&fit=crop' },
]

function getFallbackForEndpoint(endpoint: string) {
  if (endpoint.includes('trending')) return FALLBACK_PRODUCTS.slice(0, 4)
  if (endpoint.includes('new-arrivals')) return FALLBACK_PRODUCTS.filter(m => m.seller_new)
  return [...FALLBACK_PRODUCTS].reverse().slice(0, 5)
}

export function RecommendationCarousel({ title, subtitle, endpoint }: RecommendationCarouselProps) {
  const [products, setProducts] = useState<any[]>(() => getFallbackForEndpoint(endpoint))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartX = useRef(0)
  const dragScrollLeft = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  const scrollBy = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const containerWidth = el.clientWidth
    // Scroll by roughly 80% of the visible container width (shows ~1 screen of new items)
    const amount = direction === 'left' ? -containerWidth * 0.8 : containerWidth * 0.8
    el.scrollBy({ left: amount, behavior: 'smooth' })
    setTimeout(() => {
      if (mountedRef.current) checkScroll()
    }, 400)
  }, [checkScroll])

  // Mouse drag-to-scroll
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    setIsDragging(true)
    dragStartX.current = e.pageX - el.offsetLeft
    dragScrollLeft.current = el.scrollLeft
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollRef.current.offsetLeft
    const walk = (x - dragStartX.current) * 1.5
    scrollRef.current.scrollLeft = dragScrollLeft.current - walk
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !scrollRef.current) return
    setIsDragging(false)
    scrollRef.current.style.cursor = ''
    scrollRef.current.style.userSelect = ''
    checkScroll()
  }, [isDragging, checkScroll])

  useEffect(() => {
    mountedRef.current = true
    setProducts(getFallbackForEndpoint(endpoint))

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const fetchReal = async () => {
      try {
        const response = await api.get(
          `http://localhost:3001/api/recommendations${endpoint}`,
          { signal: controller.signal, timeout: FETCH_TIMEOUT_MS }
        )
        if (!mountedRef.current) return

        const dataKey = Object.keys(response.data).find(k => Array.isArray(response.data[k]))
        const items = response.data[dataKey] || []
        if (items.length > 0) {
          const explanation = response.data.explanation
          setProducts(items.map((item: any) => ({ ...item, explanation })))
        }
      } catch {
        // API unavailable — fallback is already showing
      }
    }

    fetchReal()

    return () => {
      mountedRef.current = false
      controller.abort()
    }
  }, [endpoint])

  // Check scroll state on mount, products change, and resize
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Use requestAnimationFrame to wait for layout
    const raf = requestAnimationFrame(() => checkScroll())
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [products, checkScroll])

  if (products.length === 0) return null

  return (
    <section className="py-12 relative">
      <div className="container mx-auto px-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          </div>
          {/* Scroll buttons — always visible on all screen sizes */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollBy('left')}
              disabled={!canScrollLeft}
              className={`h-11 w-11 rounded-full flex items-center justify-center border transition-all shadow-sm ${
                canScrollLeft
                  ? 'bg-card text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md border-border active:scale-95'
                  : 'bg-muted/40 text-muted-foreground/30 border-transparent cursor-not-allowed'
              }`}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => scrollBy('right')}
              disabled={!canScrollRight}
              className={`h-11 w-11 rounded-full flex items-center justify-center border transition-all shadow-sm ${
                canScrollRight
                  ? 'bg-card text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md border-border active:scale-95'
                  : 'bg-muted/40 text-muted-foreground/30 border-transparent cursor-not-allowed'
              }`}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full overflow-x-auto pb-6 scrollbar-custom"
        >
          <div className="container mx-auto px-4">
            <div className="flex gap-6 w-max">
              {products.map((product: any) => (
                <div key={product.id} className="w-[256px] min-w-[256px] max-w-[256px] flex-shrink-0">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right fade indicator — shows there's more content to scroll to */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-6 w-12 bg-gradient-to-l from-background via-background/70 to-transparent pointer-events-none" />
        )}
      </div>
    </section>
  )
}
