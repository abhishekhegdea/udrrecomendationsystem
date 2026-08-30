import { useRef } from 'react'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { ProductCard } from './ProductCard'
import { useQuickView } from '@/contexts/QuickViewContext'

export function RecentlyViewedCarousel() {
  const { recentlyViewed } = useQuickView()
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return
    const amount = 280 * 3 // scroll 3 cards at a time
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth'
    })
  }

  // No recently viewed items — don't render anything
  if (recentlyViewed.length === 0) return null

  const products = recentlyViewed.slice(0, 10)

  return (
    <section className="py-12 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                Recently Viewed
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Pick up where you left off
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="w-full overflow-x-auto pb-4 hide-scrollbar"
        >
          <div className="container mx-auto px-4">
            <div className="flex gap-6 w-max">
              {products.map((product) => (
                <div key={product.id} className="w-[256px] min-w-[256px] max-w-[256px] flex-shrink-0">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
