import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HeroSection } from '@/components/ui/HeroSection'
import { ProductCard } from '@/components/ui/ProductCard'
import { ProductGridSkeleton } from '@/components/ui/ProductSkeleton'
import { BackToTop } from '@/components/ui/BackToTop'
import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'
import { RecentlyViewedCarousel } from '@/components/ui/RecentlyViewedCarousel'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowRight, SlidersHorizontal, ChevronLeft, ChevronRight, Search, TrendingUp, Sparkles, Palette, Sofa, Shirt, Gift, Gem, Brush, Music, Globe } from 'lucide-react'
import api, { isCancel } from '@/lib/api'
import { useAbortSignal } from '@/hooks/useApiCall'
import { getProductImageUrl } from '@/lib/utils'

const ITEMS_PER_PAGE = 24
const FETCH_TIMEOUT_MS = 5000
const SLOW_CONNECTION_MS = 3000 // Show "still loading" hint after this delay

const categoryIcons: Record<string, React.ReactNode> = {
  'Home & Living': <Sofa className="h-5 w-5" />,
  'Art & Collectibles': <Palette className="h-5 w-5" />,
  'Jewelry': <Gem className="h-5 w-5" />,
  'Clothing': <Shirt className="h-5 w-5" />,
  'Accessories': <Gift className="h-5 w-5" />,
  'Craft Supplies & Tools': <Brush className="h-5 w-5" />,
  'Weddings': <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
  'Entertainment': <Music className="h-5 w-5" />,
  'Vintage': <Globe className="h-5 w-5" />,
  'Paper & Party Supplies': <Sparkles className="h-5 w-5" />
}

export function HomePage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [slowConnection, setSlowConnection] = useState(false)
  const [page, setPage] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return parseInt(params.get('page') || '1')
  })
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [sort, setSort] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('sort') || 'newest'
  })
  const [activeCategory, setActiveCategory] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('categoryId') || ''
  })

  const [fetchKey, setFetchKey] = useState(0)

  const productsRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  // Scroll to products section on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (productsRef.current) {
        productsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  // Handle search from the home page search bar
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const { getSignal: getCatSignal, mountedRef: catMounted } = useAbortSignal()

  // Fetch categories
  useEffect(() => {
    api.get('http://localhost:3001/api/products/categories/all', {
      signal: getCatSignal(),
      timeout: FETCH_TIMEOUT_MS,
    })
      .then(res => { if (catMounted.current) setCategories(res.data) })
      .catch(err => { if (!isCancel(err)) console.error('Failed to load categories', err) })
    return () => getCatSignal()
  }, [])

  const { getSignal: getProdSignal, mountedRef: prodMounted } = useAbortSignal()

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true)
      setFetchError(false)
      setSlowConnection(false)

      // Show "still loading" hint after 3 seconds
      const slowTimer = setTimeout(() => {
        if (prodMounted.current) setSlowConnection(true)
      }, SLOW_CONNECTION_MS)

      try {
        const params: any = {
          page,
          limit: ITEMS_PER_PAGE,
          sort
        }
        if (activeCategory) {
          params.categoryId = activeCategory
        }
        const res = await api.get('http://localhost:3001/api/products', {
          params,
          signal: getProdSignal(),
          timeout: FETCH_TIMEOUT_MS,
        })
        clearTimeout(slowTimer)
        if (prodMounted.current) {
          setProducts(res.data.data)
          setTotalPages(res.data.meta.totalPages)
          setTotalCount(res.data.meta.total)
          setSlowConnection(false)
        }
      } catch (err) {
        clearTimeout(slowTimer)
        if (!isCancel(err) && prodMounted.current) {
          console.error('Failed to fetch products', err)
          setFetchError(true)
        }
      } finally {
        if (prodMounted.current) setLoading(false)
      }
    }
    fetchProducts()
    return () => getProdSignal()
  }, [page, sort, activeCategory, fetchKey])

  // Sync URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (sort !== 'newest') params.set('sort', sort)
    if (activeCategory) params.set('categoryId', activeCategory)
    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }, [page, sort, activeCategory])

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'popular', label: 'Most Popular' },
    { value: 'rating', label: 'Highest Rated' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
  ]

  return (
    <div className="flex flex-col w-full">
      <HeroSection />

      {/* Prominent Search Section */}
      <section className="bg-gradient-to-b from-primary/5 to-background py-10 border-b border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
              What are you looking for?
            </h2>
            <p className="text-muted-foreground">
              Search through 10,000+ handcrafted products from local artisans
            </p>
          </div>
          <form onSubmit={handleSearch} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search handcrafted items, brands, materials..."
                className="w-full h-14 pl-14 pr-36 bg-card border-2 border-border focus:border-primary rounded-2xl text-base outline-none transition-all shadow-sm focus:shadow-lg focus:shadow-primary/10"
              />
              <button
                type="submit"
                className="absolute right-2 h-10 px-6 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all text-sm"
              >
                Search
              </button>
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground justify-center">
              <span>Popular:</span>
              {['Handmade Jewelry', 'Home Decor', 'Pashmina Shawls', 'Pottery'].map(term => (
                <button
                  key={term}
                  type="button"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                  className="px-3 py-1.5 bg-muted rounded-full hover:bg-primary/10 hover:text-primary transition-all"
                >
                  {term}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      {/* Category Strip - Flipkart Style with Icons */}
      <section ref={productsRef} className="py-6 bg-background border-b border-border sticky top-16 z-30 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar">
            <button
              onClick={() => { setActiveCategory(''); setPage(1) }}
              className={`flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                !activeCategory 
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-2 ring-primary/30' 
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/20'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              All
            </button>
            {categories.slice(0, 10).map(cat => {
              const isActive = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setPage(1) }}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-2 ring-primary/30 scale-105'
                      : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-primary/20'
                  }`}
                >
                  <span className={`${isActive ? 'text-primary-foreground' : 'text-muted-foreground'} transition-colors`}>
                    {categoryIcons[cat.name] || <Gem className="h-4 w-4" />}
                  </span>
                  {cat.name}
                </button>
              )
            })}
            <Link 
              to="/search" 
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-accent/10 text-accent hover:bg-accent/20 hover:scale-105 transition-all whitespace-nowrap"
            >
              All Categories <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header with Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              {activeCategory 
                ? categories.find(c => c.id === activeCategory)?.name || 'Products'
                : 'All Products'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {totalCount > 0 
                ? `${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, totalCount)} of ${totalCount.toLocaleString()} products` 
                : loading ? 'Loading...' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1) }}
              className="h-10 px-4 bg-muted border border-border rounded-xl text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {sortOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="py-4">
            {slowConnection && (
              <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                <div className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                Taking longer than expected — server may be temporarily slow.
              </div>
            )}
            <ProductGridSkeleton count={ITEMS_PER_PAGE} />
          </div>
        ) : fetchError || products.length === 0 ? (
          <div className="text-center py-20 bg-muted/30 rounded-3xl border border-border">
            {fetchError ? (
              <>
                <div className="text-5xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-foreground mb-2">Could not load products</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  The server took too long to respond. Check your connection and try again.
                </p>
                <button
                  onClick={() => { setFetchKey(k => k + 1) }}
                  className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-foreground mb-2">No products found</h3>
                <p className="text-muted-foreground mb-6">Try a different category or check back later.</p>
                <button
                  onClick={() => { setActiveCategory(''); setSort('newest'); setPage(1) }}
                  className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors"
                >
                  Reset Filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {products.map((product) => {
                const cardProduct = {
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  currency: product.currency,
                  averageRating: product.averageRating,
                  reviewsCount: product.reviewsCount,
                  brand: product.brand,
                  seller_name: product.seller?.businessName || product.seller?.firstName,
                  seller_new: product.seller?.isNewSeller,
                  image: getProductImageUrl(product.images?.[0]?.url)
                }
                return <ProductCard key={product.id} product={cardProduct} />
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-12 mb-8">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-5 py-2.5 bg-muted text-foreground rounded-xl font-semibold text-sm hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                
                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (page <= 4) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = page - 3 + i
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                          page === pageNum
                            ? 'bg-primary text-primary-foreground shadow-md'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-5 py-2.5 bg-muted text-foreground rounded-xl font-semibold text-sm hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Recently Viewed */}
      <RecentlyViewedCarousel />

      {/* Recommendation Sections — personalized first, then trending, then new */}
      <div className="mt-4">
        {user && (
          <RecommendationCarousel 
            title="Recommended For You" 
            subtitle="Hand-picked items based on your browsing history."
            endpoint={`/home/${user.id}`} 
          />
        )}

        <RecommendationCarousel 
          title="Trending Now" 
          subtitle="Pieces that everyone is talking about this week."
          endpoint="/trending" 
        />
        
        <RecommendationCarousel 
          title="New Artisans" 
          subtitle="Discover fresh talent and one-of-a-kind styles."
          endpoint="/new-arrivals" 
        />
      </div>

      <BackToTop />
    </div>
  )
}
