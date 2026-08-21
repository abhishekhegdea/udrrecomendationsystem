import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import {
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
} from 'lucide-react'

import api, {
  isCancel,
} from '@/lib/api'

import {
  ProductCard,
} from '@/components/ui/ProductCard'

import {
  ProductGridSkeleton,
} from '@/components/ui/ProductSkeleton'

import {
  BackToTop,
} from '@/components/ui/BackToTop'

import {
  getProductImageUrl,
} from '@/lib/utils'

import {
  uniqueById,
} from '@/lib/dedupe'

import {
  useAuth,
} from '@/contexts/AuthContext'

import {
  trackSearch,
} from '@/lib/track'


const ITEMS_PER_PAGE = 24

const API_BASE =
  'http://localhost:3001'


interface Category {
  id: string
  name: string
}


interface ProductImage {
  id?: string
  url?: string
}


interface Seller {
  id?: string
  businessName?: string | null
  firstName?: string | null
  isNewSeller?: boolean
}


interface ApiProduct {
  id: string
  name: string
  price: number

  currency?: string

  averageRating?: number
  reviewsCount?: number

  brand?: string | null

  description?: string

  materials?: string[]

  category?: {
    id?: string
    name?: string
  } | null

  seller?: Seller | null

  images?: ProductImage[]
}


interface ProductsResponse {
  data?: ApiProduct[]

  meta?: {
    total?: number
    page?: number
    limit?: number
    totalPages?: number
  }
}


function getValidPage(
  value: string | null
): number {
  const parsed =
    Number.parseInt(
      value || '1',
      10
    )

  if (
    !Number.isFinite(parsed) ||
    parsed < 1
  ) {
    return 1
  }

  return parsed
}


export function SearchPage() {
  const [
    searchParams,
  ] =
    useSearchParams()

  const {
    categoryId:
      routeCategoryId,
  } =
    useParams()

  const navigate =
    useNavigate()

  const {
    user,
  } =
    useAuth()


  /**
   * ---------------------------------------------------------
   * URL VALUES
   * ---------------------------------------------------------
   */

  const query =
    searchParams.get('q') ||
    ''

  const categoryParam =
    searchParams.get(
      'categoryId'
    ) || ''

  const minPriceParam =
    searchParams.get(
      'minPrice'
    ) || ''

  const maxPriceParam =
    searchParams.get(
      'maxPrice'
    ) || ''

  const minRatingParam =
    searchParams.get(
      'minRating'
    ) || ''

  const sortParam =
    searchParams.get(
      'sort'
    ) || 'newest'

  const page =
    getValidPage(
      searchParams.get(
        'page'
      )
    )


  /**
   * ---------------------------------------------------------
   * DATA STATE
   * ---------------------------------------------------------
   */

  const [
    products,
    setProducts,
  ] =
    useState<ApiProduct[]>(
      []
    )

  const [
    categories,
    setCategories,
  ] =
    useState<Category[]>(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    fetchError,
    setFetchError,
  ] =
    useState(false)

  const [
    totalProducts,
    setTotalProducts,
  ] =
    useState(0)

  const [
    totalPages,
    setTotalPages,
  ] =
    useState(1)


  /**
   * ---------------------------------------------------------
   * FILTER FORM STATE
   * ---------------------------------------------------------
   */

  const [
    selectedCategory,
    setSelectedCategory,
  ] =
    useState(
      categoryParam
    )

  const [
    minPrice,
    setMinPrice,
  ] =
    useState(
      minPriceParam
    )

  const [
    maxPrice,
    setMaxPrice,
  ] =
    useState(
      maxPriceParam
    )

  const [
    minRating,
    setMinRating,
  ] =
    useState(
      minRatingParam
    )


  const lastTrackedQuery =
    useRef('')


  /**
   * ---------------------------------------------------------
   * SYNC FORM WITH URL
   * ---------------------------------------------------------
   */

  useEffect(() => {
    setMinPrice(
      minPriceParam
    )

    setMaxPrice(
      maxPriceParam
    )

    setMinRating(
      minRatingParam
    )

    if (!routeCategoryId) {
      setSelectedCategory(
        categoryParam
      )
    }
  }, [
    categoryParam,
    minPriceParam,
    maxPriceParam,
    minRatingParam,
    routeCategoryId,
  ])


  /**
   * ---------------------------------------------------------
   * LOAD CATEGORIES
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const controller =
      new AbortController()

    const loadCategories =
      async () => {
        try {
          const response =
            await api.get<
              Category[]
            >(
              `${API_BASE}/api/products/categories/all`,
              {
                signal:
                  controller.signal,

                timeout:
                  5000,
              }
            )

          if (
            controller.signal
              .aborted
          ) {
            return
          }

          const rawCategories =
            Array.isArray(
              response.data
            )
              ? response.data
              : []

          /**
           * Categories should also have unique React keys.
           */
          const uniqueCategories =
            uniqueById(
              rawCategories.filter(
                (
                  category
                ): category is Category =>
                  Boolean(
                    category &&
                    typeof category.id ===
                      'string' &&
                    typeof category.name ===
                      'string'
                  )
              )
            )

          setCategories(
            uniqueCategories
          )


          /**
           * Navbar category URLs may provide the category
           * name rather than its database UUID.
           *
           * Example:
           *
           * /search/category/Furniture
           */
          if (
            routeCategoryId
          ) {
            const matchedCategory =
              uniqueCategories.find(
                (category) =>
                  category.id ===
                    routeCategoryId ||
                  category.name.toLowerCase() ===
                    routeCategoryId.toLowerCase()
              )

            if (
              matchedCategory
            ) {
              setSelectedCategory(
                matchedCategory.id
              )
            }
          }
        } catch (error) {
          if (
            controller.signal
              .aborted ||
            isCancel(error)
          ) {
            return
          }

          console.error(
            'Failed to load categories:',
            error
          )

          setCategories([])
        }
      }

    loadCategories()

    return () => {
      controller.abort()
    }
  }, [
    routeCategoryId,
  ])


  /**
   * ---------------------------------------------------------
   * LOAD PRODUCTS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    const controller =
      new AbortController()

    const loadProducts =
      async () => {
        setLoading(true)

        setFetchError(
          false
        )

        try {
          const params:
            Record<
              string,
              string | number
            > = {
              page,
              limit:
                ITEMS_PER_PAGE,
              sort:
                sortParam,
            }


          /**
           * Search query.
           */
          if (
            query.trim()
          ) {
            params.q =
              query.trim()
          }


          /**
           * Category supplied by a route.
           *
           * Existing application routing may use category
           * names such as Furniture.
           */
          if (
            routeCategoryId
          ) {
            params.categoryName =
              routeCategoryId
          } else if (
            categoryParam
          ) {
            params.categoryId =
              categoryParam
          }


          if (
            minPriceParam
          ) {
            params.minPrice =
              minPriceParam
          }


          if (
            maxPriceParam
          ) {
            params.maxPrice =
              maxPriceParam
          }


          if (
            minRatingParam
          ) {
            params.minRating =
              minRatingParam
          }


          const response =
            await api.get<
              ProductsResponse
            >(
              `${API_BASE}/api/products`,
              {
                params,

                signal:
                  controller.signal,

                timeout:
                  10000,
              }
            )


          if (
            controller.signal
              .aborted
          ) {
            return
          }


          /**
           * -------------------------------------------------
           * IMPORTANT DUPLICATE FIX
           * -------------------------------------------------
           *
           * Never pass duplicate product IDs into React.
           */

          const rawProducts =
            Array.isArray(
              response.data
                ?.data
            )
              ? response.data
                  .data
              : []


          const validProducts =
            rawProducts.filter(
              (
                product
              ): product is ApiProduct =>
                Boolean(
                  product &&
                  typeof product.id ===
                    'string' &&
                  product.id
                    .trim()
                    .length >
                    0 &&
                  typeof product.name ===
                    'string'
                )
            )


          const uniqueProducts =
            uniqueById(
              validProducts
            )


          setProducts(
            uniqueProducts
          )


          const apiTotal =
            Number(
              response.data
                ?.meta?.total
            )


          setTotalProducts(
            Number.isFinite(
              apiTotal
            )
              ? apiTotal
              : uniqueProducts.length
          )


          const apiTotalPages =
            Number(
              response.data
                ?.meta
                ?.totalPages
            )


          setTotalPages(
            Number.isFinite(
              apiTotalPages
            ) &&
              apiTotalPages >
                0
              ? apiTotalPages
              : 1
          )


          /**
           * -------------------------------------------------
           * SEARCH TRACKING
           * -------------------------------------------------
           */

          const trimmedQuery =
            query.trim()


          if (
            user &&
            trimmedQuery &&
            lastTrackedQuery
              .current !==
              trimmedQuery
          ) {
            lastTrackedQuery.current =
              trimmedQuery

            trackSearch(
              user.id,
              trimmedQuery,
              {
                resultCount:
                  uniqueProducts.length,

                source:
                  'search_page',
              }
            )
          } else if (
            !trimmedQuery
          ) {
            lastTrackedQuery.current =
              ''
          }
        } catch (error) {
          if (
            controller.signal
              .aborted ||
            isCancel(error)
          ) {
            return
          }


          console.error(
            'Failed to fetch products:',
            error
          )


          setProducts([])

          setTotalProducts(
            0
          )

          setTotalPages(
            1
          )

          setFetchError(
            true
          )
        } finally {
          if (
            !controller.signal
              .aborted
          ) {
            setLoading(false)
          }
        }
      }


    loadProducts()


    return () => {
      controller.abort()
    }
  }, [
    query,
    routeCategoryId,
    categoryParam,
    minPriceParam,
    maxPriceParam,
    minRatingParam,
    sortParam,
    page,
    user,
  ])


  /**
   * ---------------------------------------------------------
   * BUILD URL
   * ---------------------------------------------------------
   */

  const updateSearch =
    (
      overrides: Record<
        string,
        string | undefined
      >
    ) => {
      const params =
        new URLSearchParams()

      if (query.trim()) {
        params.set(
          'q',
          query.trim()
        )
      }


      const nextCategory =
        overrides.categoryId !==
        undefined
          ? overrides.categoryId
          : selectedCategory


      const nextMinPrice =
        overrides.minPrice !==
        undefined
          ? overrides.minPrice
          : minPrice


      const nextMaxPrice =
        overrides.maxPrice !==
        undefined
          ? overrides.maxPrice
          : maxPrice


      const nextMinRating =
        overrides.minRating !==
        undefined
          ? overrides.minRating
          : minRating


      const nextSort =
        overrides.sort !==
        undefined
          ? overrides.sort
          : sortParam


      const nextPage =
        overrides.page !==
        undefined
          ? overrides.page
          : '1'


      if (
        nextCategory
      ) {
        params.set(
          'categoryId',
          nextCategory
        )
      }


      if (
        nextMinPrice
      ) {
        params.set(
          'minPrice',
          nextMinPrice
        )
      }


      if (
        nextMaxPrice
      ) {
        params.set(
          'maxPrice',
          nextMaxPrice
        )
      }


      if (
        nextMinRating
      ) {
        params.set(
          'minRating',
          nextMinRating
        )
      }


      if (
        nextSort &&
        nextSort !==
          'newest'
      ) {
        params.set(
          'sort',
          nextSort
        )
      }


      if (
        nextPage &&
        nextPage !==
          '1'
      ) {
        params.set(
          'page',
          nextPage
        )
      }


      const queryString =
        params.toString()


      /**
       * Navigate to /search instead of retaining a category
       * route such as /search/category/Furniture.
       */
      navigate(
        queryString
          ? `/search?${queryString}`
          : '/search'
      )
    }


  /**
   * ---------------------------------------------------------
   * APPLY FILTERS
   * ---------------------------------------------------------
   */

  const applyFilters =
    () => {
      updateSearch({
        categoryId:
          selectedCategory,

        minPrice,

        maxPrice,

        minRating,

        page:
          '1',
      })
    }


  /**
   * ---------------------------------------------------------
   * CLEAR FILTERS
   * ---------------------------------------------------------
   */

  const clearFilters =
    () => {
      setSelectedCategory(
        ''
      )

      setMinPrice(
        ''
      )

      setMaxPrice(
        ''
      )

      setMinRating(
        ''
      )


      const params =
        new URLSearchParams()


      if (
        query.trim()
      ) {
        params.set(
          'q',
          query.trim()
        )
      }


      navigate(
        params.toString()
          ? `/search?${params.toString()}`
          : '/search'
      )
    }


  /**
   * ---------------------------------------------------------
   * SORT
   * ---------------------------------------------------------
   */

  const handleSortChange =
    (
      newSort: string
    ) => {
      updateSearch({
        sort:
          newSort,

        page:
          '1',
      })
    }


  /**
   * ---------------------------------------------------------
   * PAGINATION
   * ---------------------------------------------------------
   */

  const goToPage =
    (
      nextPage: number
    ) => {
      if (
        nextPage < 1 ||
        nextPage >
          totalPages
      ) {
        return
      }


      updateSearch({
        page:
          String(
            nextPage
          ),
      })


      window.scrollTo({
        top: 0,
        behavior:
          'smooth',
      })
    }


  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* =================================================
              FILTER SIDEBAR
          ================================================= */}

          <aside className="w-full lg:w-60 flex-shrink-0">

            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm">

              <div className="flex items-center gap-2 mb-6">

                <SlidersHorizontal className="h-5 w-5" />

                <h2 className="font-bold text-lg">
                  Filters
                </h2>

              </div>


              {/* CATEGORY */}

              <div className="mb-6">

                <label
                  htmlFor="category-filter"
                  className="block text-sm font-semibold mb-2"
                >
                  Category
                </label>

                <select
                  id="category-filter"
                  value={
                    selectedCategory
                  }
                  onChange={(
                    event
                  ) =>
                    setSelectedCategory(
                      event.target
                        .value
                    )
                  }
                  className="w-full h-11 rounded-full border border-border bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">
                    All Categories
                  </option>

                  {categories.map(
                    (
                      category
                    ) => (
                      <option
                        key={
                          category.id
                        }
                        value={
                          category.id
                        }
                      >
                        {
                          category.name
                        }
                      </option>
                    )
                  )}

                </select>

              </div>


              {/* MIN PRICE */}

              <div className="mb-6">

                <label
                  htmlFor="min-price-filter"
                  className="block text-sm font-semibold mb-2"
                >
                  Minimum Price
                </label>

                <input
                  id="min-price-filter"
                  type="number"
                  min="0"
                  value={
                    minPrice
                  }
                  onChange={(
                    event
                  ) =>
                    setMinPrice(
                      event.target
                        .value
                    )
                  }
                  placeholder="₹0"
                  className="w-full h-11 rounded-full border border-border bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />

              </div>


              {/* MAX PRICE */}

              <div className="mb-6">

                <label
                  htmlFor="max-price-filter"
                  className="block text-sm font-semibold mb-2"
                >
                  Maximum Price
                </label>

                <input
                  id="max-price-filter"
                  type="number"
                  min="0"
                  value={
                    maxPrice
                  }
                  onChange={(
                    event
                  ) =>
                    setMaxPrice(
                      event.target
                        .value
                    )
                  }
                  placeholder="No maximum"
                  className="w-full h-11 rounded-full border border-border bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />

              </div>


              {/* RATING */}

              <div className="mb-5">

                <label
                  htmlFor="rating-filter"
                  className="block text-sm font-semibold mb-2"
                >
                  Minimum Rating
                </label>

                <select
                  id="rating-filter"
                  value={
                    minRating
                  }
                  onChange={(
                    event
                  ) =>
                    setMinRating(
                      event.target
                        .value
                    )
                  }
                  className="w-full h-11 rounded-full border border-border bg-muted/50 px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >

                  <option value="">
                    Any Rating
                  </option>

                  <option value="4">
                    4★ & up
                  </option>

                  <option value="3">
                    3★ & up
                  </option>

                  <option value="2">
                    2★ & up
                  </option>

                  <option value="1">
                    1★ & up
                  </option>

                </select>

              </div>


              {/* APPLY */}

              <button
                type="button"
                onClick={
                  applyFilters
                }
                className="w-full h-11 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Apply Filters
              </button>


              {/* CLEAR */}

              <button
                type="button"
                onClick={
                  clearFilters
                }
                className="w-full mt-4 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Clear Filters
              </button>

            </div>

          </aside>


          {/* =================================================
              PRODUCTS
          ================================================= */}

          <main className="flex-1 min-w-0">

            {/* HEADER */}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">

              <div>

                <h1 className="text-3xl font-display font-bold text-foreground">

                  {query
                    ? `Search results for "${query}"`
                    : 'Browse Products'}

                </h1>

                <p className="text-sm text-muted-foreground mt-1">

                  {loading
                    ? 'Loading products...'
                    : `${totalProducts.toLocaleString()} products found`}

                </p>

              </div>


              <select
                value={
                  sortParam
                }
                onChange={(
                  event
                ) =>
                  handleSortChange(
                    event.target
                      .value
                  )
                }
                className="h-11 min-w-40 rounded-full border border-border bg-muted/50 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >

                <option value="newest">
                  Newest First
                </option>

                <option value="popular">
                  Most Popular
                </option>

                <option value="rating">
                  Highest Rated
                </option>

                <option value="price_asc">
                  Price: Low to High
                </option>

                <option value="price_desc">
                  Price: High to Low
                </option>

              </select>

            </div>


            {/* LOADING */}

            {loading ? (

              <ProductGridSkeleton
                count={12}
              />

            ) : fetchError ? (

              /* ERROR STATE */

              <div className="min-h-[280px] flex flex-col items-center justify-center text-center bg-muted/20 border border-border rounded-3xl px-6">

                <div className="text-5xl mb-4">
                  ⚠️
                </div>

                <h3 className="text-xl font-bold mb-2">
                  Could not load products
                </h3>

                <p className="text-muted-foreground mb-6">
                  The product service could not be reached.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    window.location.reload()
                  }
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90"
                >
                  Retry
                </button>

              </div>

            ) : products.length ===
              0 ? (

              /* EMPTY STATE */

              <div className="min-h-[280px] flex flex-col items-center justify-center text-center bg-muted/20 border border-border rounded-3xl px-6">

                <Filter className="h-12 w-12 text-muted-foreground mb-4" />

                <h3 className="text-xl font-bold text-foreground mb-2">
                  No products found
                </h3>

                <p className="text-muted-foreground mb-6">
                  Try adjusting your search or filters.
                </p>

                <button
                  type="button"
                  onClick={
                    clearFilters
                  }
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors"
                >
                  Clear Filters
                </button>

              </div>

            ) : (

              <>
                {/* PRODUCT GRID */}

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">

                  {products.map(
                    (
                      product
                    ) => {

                      const cardProduct = {
                        id:
                          product.id,

                        name:
                          product.name,

                        price:
                          Number(
                            product.price
                          ) || 0,

                        currency:
                          product.currency ||
                          'INR',

                        averageRating:
                          product.averageRating,

                        reviewsCount:
                          product.reviewsCount,

                        brand:
                          product.brand ||
                          undefined,

                        seller_name:
                          product.seller
                            ?.businessName ||
                          product.seller
                            ?.firstName ||
                          undefined,

                        seller_new:
                          Boolean(
                            product.seller
                              ?.isNewSeller
                          ),

                        image:
                          getProductImageUrl(
                            product.images?.[0]
                              ?.url
                          ),

                        description:
                          product.description,

                        materials:
                          Array.isArray(
                            product.materials
                          )
                            ? product.materials
                            : undefined,

                        categoryName:
                          product.category
                            ?.name,
                      }


                      /**
                       * product.id is now guaranteed to be
                       * unique because uniqueById() ran
                       * before setProducts().
                       */
                      return (
                        <ProductCard
                          key={
                            product.id
                          }
                          product={
                            cardProduct
                          }
                        />
                      )
                    }
                  )}

                </div>


                {/* PAGINATION */}

                {totalPages > 1 && (

                  <div className="flex items-center justify-center gap-3 mt-10">

                    <button
                      type="button"
                      onClick={() =>
                        goToPage(
                          page - 1
                        )
                      }
                      disabled={
                        page <= 1
                      }
                      className="h-10 px-4 rounded-xl border border-border flex items-center gap-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                    >

                      <ChevronLeft className="h-4 w-4" />

                      Previous

                    </button>


                    <span className="text-sm text-muted-foreground">

                      Page{' '}

                      <strong className="text-foreground">
                        {page}
                      </strong>

                      {' '}of{' '}

                      <strong className="text-foreground">
                        {
                          totalPages
                        }
                      </strong>

                    </span>


                    <button
                      type="button"
                      onClick={() =>
                        goToPage(
                          page + 1
                        )
                      }
                      disabled={
                        page >=
                        totalPages
                      }
                      className="h-10 px-4 rounded-xl border border-border flex items-center gap-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                    >

                      Next

                      <ChevronRight className="h-4 w-4" />

                    </button>

                  </div>

                )}

              </>

            )}

          </main>

        </div>
      </div>


      <BackToTop />
    </>
  )
}