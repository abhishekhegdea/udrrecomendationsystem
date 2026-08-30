import {
  useEffect,
  useState,
  useRef,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  Link,
  useNavigate,
} from 'react-router-dom'

import {
  ArrowRight,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Search,
  TrendingUp,
  Sparkles,
  Palette,
  Sofa,
  Shirt,
  Gift,
  Gem,
  Brush,
  Music,
  Globe,
} from 'lucide-react'

import { HeroSection } from '@/components/ui/HeroSection'

import { ProductCard } from '@/components/ui/ProductCard'

import { ProductGridSkeleton } from '@/components/ui/ProductSkeleton'

import { BackToTop } from '@/components/ui/BackToTop'

import { RecommendationCarousel } from '@/components/ui/RecommendationCarousel'

import { RecentlyViewedCarousel } from '@/components/ui/RecentlyViewedCarousel'

import { useAuth } from '@/contexts/AuthContext'

import api, {
  isCancel,
} from '@/lib/api'

import { useAbortSignal } from '@/hooks/useApiCall'

import { getProductImageUrl } from '@/lib/utils'

const ITEMS_PER_PAGE =
  24

const FETCH_TIMEOUT_MS =
  5000

const SLOW_CONNECTION_MS =
  3000

const categoryIcons:
  Record<string, ReactNode> = {
  'Home & Living': (
    <Sofa className="h-5 w-5" />
  ),

  'Art & Collectibles': (
    <Palette className="h-5 w-5" />
  ),

  Jewelry: (
    <Gem className="h-5 w-5" />
  ),

  Clothing: (
    <Shirt className="h-5 w-5" />
  ),

  Accessories: (
    <Gift className="h-5 w-5" />
  ),

  'Craft Supplies & Tools': (
    <Brush className="h-5 w-5" />
  ),

  Weddings: (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),

  Entertainment: (
    <Music className="h-5 w-5" />
  ),

  Vintage: (
    <Globe className="h-5 w-5" />
  ),

  'Paper & Party Supplies': (
    <Sparkles className="h-5 w-5" />
  ),
}

export function HomePage() {
  const { user } =
    useAuth()

  const [
    products,
    setProducts,
  ] = useState<any[]>([])

  const [
    categories,
    setCategories,
  ] = useState<any[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    fetchError,
    setFetchError,
  ] = useState(false)

  const [
    slowConnection,
    setSlowConnection,
  ] = useState(false)

  const [page, setPage] =
    useState(() => {
      const params =
        new URLSearchParams(
          window.location.search
        )

      return Number.parseInt(
        params.get('page') ||
          '1',
        10
      )
    })

  const [
    totalPages,
    setTotalPages,
  ] = useState(1)

  const [
    totalCount,
    setTotalCount,
  ] = useState(0)

  const [sort, setSort] =
    useState(() => {
      const params =
        new URLSearchParams(
          window.location.search
        )

      return (
        params.get('sort') ||
        'newest'
      )
    })

  const [
    activeCategory,
    setActiveCategory,
  ] = useState(() => {
    const params =
      new URLSearchParams(
        window.location.search
      )

    return (
      params.get(
        'categoryId'
      ) || ''
    )
  })

  const [
    fetchKey,
    setFetchKey,
  ] = useState(0)

  const productsRef =
    useRef<HTMLDivElement>(
      null
    )

  const navigate =
    useNavigate()

  const [
    searchQuery,
    setSearchQuery,
  ] = useState('')

  // ----------------------------------------------------------
  // ABORT CONTROLLERS
  // ----------------------------------------------------------

  const {
    getSignal:
      getCategorySignal,

    cancel:
      cancelCategoryRequest,

    mountedRef:
      categoryMounted,
  } = useAbortSignal()

  const {
    getSignal:
      getProductSignal,

    cancel:
      cancelProductRequest,

    mountedRef:
      productMounted,
  } = useAbortSignal()

  // ----------------------------------------------------------
  // SCROLL TO PRODUCTS
  // ----------------------------------------------------------

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          productsRef.current
            ?.scrollIntoView({
              behavior:
                'smooth',

              block:
                'start',
            })
        },
        800
      )

    return () => {
      window.clearTimeout(
        timer
      )
    }
  }, [])

  // ----------------------------------------------------------
  // HOME SEARCH
  // ----------------------------------------------------------

  const handleSearch = (
    event: FormEvent
  ) => {
    event.preventDefault()

    const query =
      searchQuery.trim()

    if (!query) {
      return
    }

    navigate(
      `/search?q=${encodeURIComponent(
        query
      )}`
    )
  }

  // ----------------------------------------------------------
  // LOAD CATEGORIES
  // ----------------------------------------------------------

  useEffect(() => {
    const fetchCategories =
      async () => {
        try {
          const response =
            await api.get(
              'http://localhost:3001/api/products/categories/all',

              {
                signal:
                  getCategorySignal(),

                timeout:
                  FETCH_TIMEOUT_MS,
              }
            )

          if (
            categoryMounted.current
          ) {
            setCategories(
              response.data
            )
          }
        } catch (error) {
          if (
            !isCancel(error)
          ) {
            console.error(
              'Failed to load categories',
              error
            )
          }
        }
      }

    fetchCategories()

    return () => {
      cancelCategoryRequest()
    }
  }, [
    getCategorySignal,
    cancelCategoryRequest,
    categoryMounted,
  ])

  // ----------------------------------------------------------
  // LOAD PRODUCTS
  // ----------------------------------------------------------

  useEffect(() => {
    const fetchProducts =
      async () => {
        setLoading(true)

        setFetchError(false)

        setSlowConnection(
          false
        )

        const slowTimer =
          window.setTimeout(
            () => {
              if (
                productMounted.current
              ) {
                setSlowConnection(
                  true
                )
              }
            },

            SLOW_CONNECTION_MS
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
            sort,
          }

          if (
            activeCategory
          ) {
            params.categoryId =
              activeCategory
          }

          const response =
            await api.get(
              'http://localhost:3001/api/products',

              {
                params,

                signal:
                  getProductSignal(),

                timeout:
                  FETCH_TIMEOUT_MS,
              }
            )

          window.clearTimeout(
            slowTimer
          )

          if (
            productMounted.current
          ) {
            setProducts(
              response.data
                ?.data ?? []
            )

            setTotalPages(
              response.data
                ?.meta
                ?.totalPages ??
                1
            )

            setTotalCount(
              response.data
                ?.meta
                ?.total ??
                0
            )

            setSlowConnection(
              false
            )
          }
        } catch (error) {
          window.clearTimeout(
            slowTimer
          )

          if (
            !isCancel(error) &&
            productMounted.current
          ) {
            console.error(
              'Failed to fetch products',
              error
            )

            setFetchError(
              true
            )
          }
        } finally {
          if (
            productMounted.current
          ) {
            setLoading(false)
          }
        }
      }

    fetchProducts()

    return () => {
      cancelProductRequest()
    }
  }, [
    page,
    sort,
    activeCategory,
    fetchKey,
    getProductSignal,
    cancelProductRequest,
    productMounted,
  ])

  // ----------------------------------------------------------
  // URL FILTER STATE
  // ----------------------------------------------------------

  useEffect(() => {
    const params =
      new URLSearchParams()

    if (page > 1) {
      params.set(
        'page',
        String(page)
      )
    }

    if (
      sort !== 'newest'
    ) {
      params.set(
        'sort',
        sort
      )
    }

    if (
      activeCategory
    ) {
      params.set(
        'categoryId',
        activeCategory
      )
    }

    const queryString =
      params.toString()

    const newUrl =
      queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname

    window.history.replaceState(
      null,
      '',
      newUrl
    )
  }, [
    page,
    sort,
    activeCategory,
  ])

  const sortOptions = [
    {
      value: 'newest',
      label: 'Newest First',
    },

    {
      value: 'popular',
      label: 'Most Popular',
    },

    {
      value: 'rating',
      label:
        'Highest Rated',
    },

    {
      value:
        'price_asc',
      label:
        'Price: Low to High',
    },

    {
      value:
        'price_desc',
      label:
        'Price: High to Low',
    },
  ]

  const handleCategory =
    (
      categoryId: string
    ) => {
      setPage(1)

      setActiveCategory(
        categoryId
      )

      productsRef.current
        ?.scrollIntoView({
          behavior: 'smooth',

          block: 'start',
        })
    }

  const handleRetry = () => {
    setFetchKey(
      (current) =>
        current + 1
    )
  }

  return (
    <div className="flex flex-col w-full">
      <HeroSection />

      {/* Search */}

      <section className="bg-gradient-to-b from-primary/5 to-background py-10 border-b border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2">
              What are you
              looking for?
            </h2>

            <p className="text-muted-foreground">
              Search through
              handcrafted
              products from
              local artisans
            </p>
          </div>

          <form
            onSubmit={
              handleSearch
            }
            className="relative"
          >
            <div className="relative flex items-center">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />

              <input
                type="text"
                value={
                  searchQuery
                }
                onChange={(
                  event
                ) =>
                  setSearchQuery(
                    event.target
                      .value
                  )
                }
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

            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
              <span>
                Popular:
              </span>

              {[
                'Handmade Jewelry',
                'Home Decor',
                'Pashmina Shawls',
                'Pottery',
              ].map(
                (term) => (
                  <button
                    type="button"
                    key={
                      term
                    }
                    onClick={() =>
                      navigate(
                        `/search?q=${encodeURIComponent(
                          term
                        )}`
                      )
                    }
                    className="hover:text-primary transition-colors"
                  >
                    {term}
                  </button>
                )
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Recommendations */}

      {user && (
        <RecommendationCarousel
          title="Recommended For You"
          subtitle="Personalized from your activity and interests"
          endpoint={`/home/${user.id}`}
        />
      )}

      <RecommendationCarousel
        title="Trending Now"
        subtitle="Popular handcrafted pieces customers are exploring"
        endpoint="/trending"
      />

      <RecommendationCarousel
        title="New Artisan Discoveries"
        subtitle="Explore products from newer UdrCrafts sellers"
        endpoint="/new-arrivals"
      />

      <RecentlyViewedCarousel />

      {/* Categories */}

      <section className="py-10 bg-muted/20 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-2xl font-display font-bold text-foreground">
                Shop by Category
              </h2>

              <p className="text-sm text-muted-foreground mt-1">
                Browse the
                marketplace by
                craft and product
                type
              </p>
            </div>

            <Link
              to="/search"
              className="hidden sm:flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              View All

              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-custom">
            <button
              type="button"
              onClick={() =>
                handleCategory(
                  ''
                )
              }
              className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                !activeCategory
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-foreground hover:border-primary'
              }`}
            >
              <TrendingUp className="h-5 w-5" />

              All Products
            </button>

            {categories.map(
              (
                category
              ) => (
                <button
                  type="button"
                  key={
                    category.id
                  }
                  onClick={() =>
                    handleCategory(
                      category.id
                    )
                  }
                  className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    activeCategory ===
                    category.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-foreground hover:border-primary'
                  }`}
                >
                  {categoryIcons[
                    category.name
                  ] || (
                    <Sparkles className="h-5 w-5" />
                  )}

                  {
                    category.name
                  }
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* Products */}

      <section
        ref={productsRef}
        className="py-12 scroll-mt-24"
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
            <div>
              <h2 className="text-3xl font-display font-bold text-foreground">
                Marketplace
              </h2>

              <p className="text-muted-foreground mt-1">
                {totalCount > 0
                  ? `${totalCount.toLocaleString()} products available`
                  : 'Discover handcrafted products'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />

              <select
                value={
                  sort
                }
                onChange={(
                  event
                ) => {
                  setSort(
                    event.target
                      .value
                  )

                  setPage(1)
                }}
                className="h-10 px-4 bg-card border border-border rounded-xl text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                {sortOptions.map(
                  (
                    option
                  ) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {
                        option.label
                      }
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {slowConnection &&
            loading && (
              <div className="mb-5 text-center text-sm text-muted-foreground">
                Products are
                taking a little
                longer to load...
              </div>
            )}

          {fetchError &&
          !loading ? (
            <div className="py-16 text-center bg-muted/30 border border-border rounded-3xl">
              <h3 className="text-xl font-bold text-foreground mb-2">
                Unable to load
                products
              </h3>

              <p className="text-muted-foreground mb-6">
                Please check
                that the backend
                server is running.
              </p>

              <button
                type="button"
                onClick={
                  handleRetry
                }
                className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <ProductGridSkeleton
              count={12}
            />
          ) : products.length ===
            0 ? (
            <div className="py-16 text-center bg-muted/30 border border-border rounded-3xl">
              <h3 className="text-xl font-bold text-foreground mb-2">
                No products
                found
              </h3>

              <p className="text-muted-foreground">
                Try another
                category or
                filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(
                (
                  product
                ) => {
                  const cardProduct =
                    {
                      id:
                        product.id,

                      name:
                        product.name,

                      price:
                        product.price,

                      currency:
                        product.currency,

                      averageRating:
                        product.averageRating,

                      reviewsCount:
                        product.reviewsCount,

                      brand:
                        product.brand,

                      description:
                        product.description,

                      materials:
                        product.materials,

                      categoryName:
                        product.category
                          ?.name,

                      seller_name:
                        product
                          .seller
                          ?.businessName ||
                        product
                          .seller
                          ?.firstName,

                      seller_new:
                        product
                          .seller
                          ?.isNewSeller,

                      image:
                        getProductImageUrl(
                          product
                            .images?.[0]
                            ?.url
                        ),
                    }

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
          )}

          {totalPages > 1 &&
            !loading &&
            !fetchError && (
              <div className="flex justify-center items-center gap-3 mt-12">
                <button
                  type="button"
                  disabled={
                    page <= 1
                  }
                  onClick={() => {
                    setPage(
                      (
                        current
                      ) =>
                        Math.max(
                          1,
                          current -
                            1
                        )
                    )

                    productsRef.current
                      ?.scrollIntoView(
                        {
                          behavior:
                            'smooth',
                        }
                      )
                  }}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="text-sm font-medium text-foreground">
                  Page {page} of{' '}
                  {totalPages}
                </span>

                <button
                  type="button"
                  disabled={
                    page >=
                    totalPages
                  }
                  onClick={() => {
                    setPage(
                      (
                        current
                      ) =>
                        Math.min(
                          totalPages,
                          current +
                            1
                        )
                    )

                    productsRef.current
                      ?.scrollIntoView(
                        {
                          behavior:
                            'smooth',
                        }
                      )
                  }}
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
        </div>
      </section>

      <BackToTop />
    </div>
  )
}