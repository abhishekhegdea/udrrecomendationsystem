import { useEffect, useState } from 'react'
import { useSearchParams, useParams, Link } from 'react-router-dom'
import { ProductCard } from '@/components/ui/ProductCard'
import { Filter, SlidersHorizontal, Loader2 } from 'lucide-react'
import axios from 'axios'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { categoryId: routeCategoryId } = useParams()
  
  const query = searchParams.get('q') || ''
  const categoryId = routeCategoryId || searchParams.get('categoryId') || ''
  const minPriceParam = searchParams.get('minPrice') || ''
  const maxPriceParam = searchParams.get('maxPrice') || ''
  
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<any[]>([])

  const [minPrice, setMinPrice] = useState(minPriceParam)
  const [maxPrice, setMaxPrice] = useState(maxPriceParam)

  const applyFilters = () => {
    const params: any = {}
    if (query) params.q = query
    if (categoryId) params.categoryId = categoryId
    if (minPrice) params.minPrice = minPrice
    if (maxPrice) params.maxPrice = maxPrice
    setSearchParams(params)
  }

  // Fetch Categories for Sidebar
  useEffect(() => {
    axios.get('http://localhost:3001/api/products/categories/all')
      .then(res => setCategories(res.data))
      .catch(console.error)
  }, [])

  // Fetch Search Results
  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true)
      try {
        const params: any = { q: query }
        if (routeCategoryId) {
          // If accessing via /category/:name, we pass it as categoryName
          params.categoryName = routeCategoryId
        } else if (categoryId) {
          params.categoryId = categoryId
        }
        if (minPriceParam) params.minPrice = minPriceParam
        if (maxPriceParam) params.maxPrice = maxPriceParam

        const res = await axios.get(`http://localhost:3001/api/products`, { params })
        setProducts(res.data.data)
      } catch (err) {
        console.error('Failed to fetch search results', err)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [query, categoryId, routeCategoryId, minPriceParam, maxPriceParam])

  return (
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
            <button 
              onClick={applyFilters}
              className="w-full py-2 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors text-sm"
            >
              Apply Filter
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            {query ? `Search results for "${query}"` : 'All Products'}
          </h1>
          <p className="text-muted-foreground">Showing {products.length} products</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                seller_name: product.seller?.businessName || product.seller?.firstName,
                seller_new: product.seller?.isNewSeller,
                image: product.images?.[0]?.url || '/products/product-vase.jpg'
              }
              return <ProductCard key={product.id} product={cardProduct} />
            })}
          </div>
        )}
      </main>
    </div>
  )
}
