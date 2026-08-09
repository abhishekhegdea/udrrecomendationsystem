import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useParams, Link } from 'react-router-dom'
import { ProductCard } from '@/components/ui/ProductCard'
import { ProductGridSkeleton } from '@/components/ui/ProductSkeleton'
import { BackToTop } from '@/components/ui/BackToTop'
import { Filter, SlidersHorizontal } from 'lucide-react'
import api, { isCancel } from '@/lib/api'
import { useAbortSignal } from '@/hooks/useApiCall'
import { getProductImageUrl } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { trackSearch } from '@/lib/track'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { categoryId: routeCategoryId } = useParams()
  const { user } = useAuth()
  const lastTrackedQuery = useRef('')
  
  const query = searchParams.get('q') || ''
  const categoryId = routeCategoryId || searchParams.get('categoryId') || ''
  const minPriceParam = searchParams.get('minPrice') || ''
  const maxPriceParam = searchParams.get('maxPrice') || ''
  const minRatingParam = searchParams.get('minRating') || ''
  const sortParam = searchParams.get('sort') || 'newest'
  
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])

  const [minPrice, setMinPrice] = useState(minPriceParam)
  const [maxPrice, setMaxPrice] = useState(maxPriceParam)
  const [minRating, setMinRating] = useState(minRatingParam)
  const [sort, setSort] = useState(sortParam)

  const applyFilters = () => {
    const params: any = {}
    if (query) params.q = query
    if (categoryId) params.categoryId = categoryId
    if (minPrice) params.minPrice = minPrice
    if (maxPrice) params.maxPrice = maxPrice
    if (minRating) params.minRating = minRating
    if (sort) params.sort = sort
    setSearchParams(params)
  }

  const { getSignal: getCatSignal, mountedRef: catMounted } = useAbortSignal()

  // Fetch Categories for Sidebar
  useEffect(() => {
    api.get('http://localhost:3001/api/products/categories/all', { signal: getCatSignal() })
      .then(res => { if (catMounted.current) setCategories(res.data) })
      .catch(err => { if (!isCancel(err)) console.error('Failed to load categories', err) })
    return () => getCatSignal()
  }, [])

  const { getSignal: getSearchSignal, mountedRef: searchMounted } = useAbortSignal()

  // Fetch Search Results
  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true)
      try {
        const params: any = { q: query }
        if (routeCategoryId) {
          params.categoryName = routeCategoryId
        } else if (categoryId) {
          params.categoryId = categoryId
        }
        if (minPriceParam) params.minPrice = minPriceParam
        if (maxPriceParam) params.maxPrice = maxPriceParam
        if (minRatingParam) params.minRating = minRatingParam
        if (sortParam) params.sort = sortParam

        const res = await api.get(`http://localhost:3001/api/products`, { params, signal: getSearchSignal() })
        if (searchMounted.current) {
          setProducts(res.data.data)
          // Fire a SEARCH event (once per distinct query) so the
          // recommendation engine can learn search affinity.
          const q = query.trim()
          if (user && q && lastTrackedQuery.current !== q) {
            lastTrackedQuery.current = q
            trackSearch(user.id, q, {
              resultCount: res.data?.data?.length ?? 0,
              source: 'search_page',
            })
          } else if (!q) {
            // Reset so a repeat of the same query later counts again
            lastTrackedQuery.current = ''
          }
        }
      } catch (err) {
        if (!isCancel(err) && searchMounted.current) {
          console.error('Failed to fetch search results', err)
        }
      } finally {
        if (searchMounted.current) setLoading(false)
      }
    }
    fetchResults()
    return () => getSearchSignal()
  }, [query, categoryId, routeCategoryId, minPriceParam, maxPriceParam, minRatingParam, sortParam])

  return (
    <>
    <div className="container mx-auto px-4 py-8 max-w-7xl flex flex-col md:flex-row gap-8">
      {/* Sidebar Filters */}
      <aside className="w-full md:w-64 flex-shrink-0">
        <div className="sticky top-28 bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-foreground">
            <SlidersHorizontal className="h-5 w-5" />
            <h2 className="font-bold text-lg">Filters</h2>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Categories</h3>
            <div className="space-y-2">
              <button 
                onClick={() => setSearchParams({ q: query })}
                className={`block text-left w-full text-sm hover:text-primary transition-colors ${!categoryId ? 'font-bold text-primary' : 'text-foreground'}`}
              >
                All Categories
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSearchParams({ q: query, categoryId: cat.id })}
                  className={`block text-left w-full text-sm hover:text-primary transition-colors ${categoryId === cat.id ? 'font-bold text-primary' : 'text-foreground'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Price Range</h3>
            <div className="flex items-center gap-2 mb-3">
              <input 
                type="number" 
                placeholder="Min" 
                value={minPrice}
                onChange={e => setMinPrice(e.target.value)}
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" 
              />
              <span className="text-muted-foreground">-</span>
              <input 
                type="number" 
                placeholder="Max" 
                value={maxPrice}
                onChange={e => setMaxPrice(e.target.value)}
                className="w-full h-10 bg-muted border border-border rounded-lg px-3 text-sm focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Minimum Rating</h3>
            <div className="space-y-2">
              {[4, 3, 2, 1].map(star => (
                <button
                  key={star}
                  onClick={() => {
                    setMinRating(minRating === String(star) ? '' : String(star));
                    const params: any = { q: query };
                    if (categoryId) params.categoryId = categoryId;
                    if (minPrice) params.minPrice = minPrice;
                    if (maxPrice) params.maxPrice = maxPrice;
                    if (minRating === String(star)) {
                      setSearchParams(params);
                    } else {
                      setSearchParams({ ...params, minRating: String(star) });
                    }
                  }}
                  className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${minRating === String(star) ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{'★'.repeat(star)}{'☆'.repeat(4 - star)}</span>
                    <span className="text-muted-foreground">& up</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={applyFilters}
            className="w-full py-2 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors text-sm"
          >
            Apply Filters
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {query ? `Search results for "${query}"` : 'All Products'}
            </h1>
            <p className="text-muted-foreground">Showing {products.length} products</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-medium">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                setSearchParams(prev => {
                  const params = new URLSearchParams(prev)
                  params.set('sort', e.target.value)
                  return params
                })
              }}
              className="h-10 px-4 bg-muted border border-border rounded-xl text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-4">
            <ProductGridSkeleton count={12} />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-muted/50 rounded-3xl border border-border">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">No products found</h3>
            <p className="text-muted-foreground mb-6">Try adjusting your search or filters.</p>
            <button 
              onClick={() => setSearchParams({})}
              className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => {
              // Map DB product to Card format
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
        )}
      </main>
    </div>

    <BackToTop />
    </>
  )
}
