import { Router } from 'express'
import { prisma } from '../db'

const router = Router()

/**
 * Express 5 query/route parameters can contain arrays.
 * This helper converts them safely into a single string.
 */
function getSingleString(
  value: unknown
): string | undefined {
  if (typeof value === 'string') {
    const cleaned = value.trim()
    return cleaned || undefined
  }

  if (
    Array.isArray(value) &&
    typeof value[0] === 'string'
  ) {
    const cleaned = value[0].trim()
    return cleaned || undefined
  }

  return undefined
}

function getPositiveInteger(
  value: unknown,
  fallback: number
): number {
  const raw = getSingleString(value)

  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    return fallback
  }

  return parsed
}

function getOptionalNumber(
  value: unknown
): number | undefined {
  const raw = getSingleString(value)

  if (!raw) {
    return undefined
  }

  const parsed = Number(raw)

  return Number.isFinite(parsed)
    ? parsed
    : undefined
}

/**
 * =========================================================
 * GET PRODUCTS
 * =========================================================
 *
 * Supports:
 *
 * GET /api/products
 * GET /api/products?q=chair
 * GET /api/products?categoryId=<uuid>
 * GET /api/products?categoryId=Furniture
 * GET /api/products?categoryName=Furniture
 * GET /api/products?minPrice=100
 * GET /api/products?maxPrice=5000
 * GET /api/products?minRating=4
 * GET /api/products?sort=newest
 */
router.get('/', async (req, res) => {
  try {
    const page =
      getPositiveInteger(
        req.query.page,
        1
      )

    const requestedLimit =
      getPositiveInteger(
        req.query.limit,
        24
      )

    /**
     * Prevent accidental extremely large requests.
     */
    const limit =
      Math.min(
        requestedLimit,
        100
      )

    const skip =
      (page - 1) * limit

    const q =
      getSingleString(
        req.query.q
      )

    const categoryId =
      getSingleString(
        req.query.categoryId
      )

    const categoryName =
      getSingleString(
        req.query.categoryName
      )

    const minPrice =
      getOptionalNumber(
        req.query.minPrice
      )

    const maxPrice =
      getOptionalNumber(
        req.query.maxPrice
      )

    const minRating =
      getOptionalNumber(
        req.query.minRating
      )

    const sort =
      getSingleString(
        req.query.sort
      ) || 'newest'

    /**
     * Build filters using AND so search/category/price/rating
     * can safely be combined.
     */
    const filters: any[] = []

    /**
     * Search product text.
     */
    if (q) {
      filters.push({
        OR: [
          {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },

          {
            description: {
              contains: q,
              mode: 'insensitive',
            },
          },

          {
            brand: {
              contains: q,
              mode: 'insensitive',
            },
          },

          {
            tags: {
              has: q,
            },
          },

          {
            materials: {
              has: q,
            },
          },
        ],
      })
    }

    /**
     * IMPORTANT FIX
     *
     * Some frontend routes may send:
     *
     * categoryId=<UUID>
     *
     * while other routes may send:
     *
     * categoryId=Furniture
     *
     * Support both.
     */
    if (categoryId) {
      filters.push({
        OR: [
          {
            categoryId,
          },

          {
            category: {
              name: {
                equals:
                  categoryId,
                mode:
                  'insensitive',
              },
            },
          },
        ],
      })
    }

    if (categoryName) {
      filters.push({
        category: {
          name: {
            contains:
              categoryName,
            mode:
              'insensitive',
          },
        },
      })
    }

    if (
      minPrice !== undefined ||
      maxPrice !== undefined
    ) {
      const priceFilter: {
        gte?: number
        lte?: number
      } = {}

      if (
        minPrice !== undefined
      ) {
        priceFilter.gte =
          minPrice
      }

      if (
        maxPrice !== undefined
      ) {
        priceFilter.lte =
          maxPrice
      }

      filters.push({
        price:
          priceFilter,
      })
    }

    if (
      minRating !== undefined
    ) {
      filters.push({
        averageRating: {
          gte:
            minRating,
        },
      })
    }

    const whereClause =
      filters.length > 0
        ? {
            AND:
              filters,
          }
        : {}

    let orderBy: any

    switch (sort) {
      case 'rating':
        orderBy = {
          averageRating:
            'desc',
        }
        break

      case 'price_asc':
        orderBy = {
          price:
            'asc',
        }
        break

      case 'price_desc':
        orderBy = {
          price:
            'desc',
        }
        break

      case 'popular':
        orderBy = {
          popularity:
            'desc',
        }
        break

      case 'newest':
      default:
        orderBy = {
          createdAt:
            'desc',
        }
        break
    }

    const [
      products,
      total,
    ] =
      await Promise.all([
        prisma.product.findMany({
          where:
            whereClause,

          skip,

          take:
            limit,

          include: {
            images:
              true,

            seller: {
              select: {
                id:
                  true,

                businessName:
                  true,

                firstName:
                  true,

                rating:
                  true,

                isNewSeller:
                  true,
              },
            },

            category: {
              select: {
                id:
                  true,

                name:
                  true,
              },
            },

            subcategory: {
              select: {
                id:
                  true,

                name:
                  true,
              },
            },
          },

          orderBy,
        }),

        prisma.product.count({
          where:
            whereClause,
        }),
      ])

    /**
     * Determine whether the entire Product table is empty
     * or only the current filter returned zero rows.
     */
    let catalogTotal =
      total

    if (
      filters.length > 0
    ) {
      catalogTotal =
        await prisma.product.count()
    }

    console.log(
      `[products] page=${page} returned=${products.length} filteredTotal=${total} catalogTotal=${catalogTotal}`
    )

    return res.json({
      data:
        products,

      meta: {
        total,

        catalogTotal,

        catalogEmpty:
          catalogTotal === 0,

        page,

        limit,

        totalPages:
          total === 0
            ? 0
            : Math.ceil(
                total /
                  limit
              ),
      },
    })
  } catch (error) {
    console.error(
      'Fetch products error:',
      error
    )

    return res
      .status(500)
      .json({
        error:
          'Failed to fetch products',

        message:
          error instanceof Error
            ? error.message
            : String(
                error
              ),
      })
  }
})


/**
 * =========================================================
 * DATABASE/CATALOG DIAGNOSTIC
 * =========================================================
 *
 * Open:
 *
 * http://localhost:3001/api/products/debug/count
 */
router.get(
  '/debug/count',
  async (_req, res) => {
    try {
      const [
        products,
        categories,
        sellers,
        sampleProducts,
      ] =
        await Promise.all([
          prisma.product.count(),

          prisma.category.count(),

          prisma.seller.count(),

          prisma.product.findMany({
            take: 5,

            select: {
              id:
                true,

              name:
                true,

              brand:
                true,

              price:
                true,

              category: {
                select: {
                  name:
                    true,
                },
              },
            },

            orderBy: {
              createdAt:
                'desc',
            },
          }),
        ])

      return res.json({
        databaseConnected:
          true,

        counts: {
          products,
          categories,
          sellers,
        },

        catalogEmpty:
          products === 0,

        sampleProducts,
      })
    } catch (error) {
      console.error(
        'Product diagnostics error:',
        error
      )

      return res
        .status(500)
        .json({
          databaseConnected:
            false,

          error:
            'Unable to read product catalog',

          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
    }
  }
)


/**
 * =========================================================
 * GET ALL CATEGORIES
 * =========================================================
 */
router.get(
  '/categories/all',
  async (_req, res) => {
    try {
      const categories =
        await prisma.category.findMany({
          include: {
            subcategories:
              true,

            _count: {
              select: {
                products:
                  true,
              },
            },
          },

          orderBy: {
            name:
              'asc',
          },
        })

      return res.json(
        categories
      )
    } catch (error) {
      console.error(
        'Fetch categories error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to fetch categories',
        })
    }
  }
)


/**
 * =========================================================
 * WISHLIST
 * =========================================================
 */
router.get(
  '/wishlist/:userId',
  async (req, res) => {
    try {
      const userId =
        getSingleString(
          req.params.userId
        )

      if (!userId) {
        return res
          .status(400)
          .json({
            error:
              'Valid userId is required',
          })
      }

      const wishlist =
        await prisma.wishlist.findMany({
          where: {
            userId,
          },

          include: {
            product: {
              include: {
                images:
                  true,

                seller: {
                  select: {
                    businessName:
                      true,
                  },
                },

                category: {
                  select: {
                    name:
                      true,
                  },
                },
              },
            },
          },

          orderBy: {
            createdAt:
              'desc',
          },
        })

      return res.json(
        wishlist
      )
    } catch (error) {
      console.error(
        'Fetch wishlist error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to fetch wishlist',
        })
    }
  }
)


router.post(
  '/wishlist',
  async (req, res) => {
    try {
      const {
        userId,
        productId,
      } = req.body

      if (
        !userId ||
        !productId
      ) {
        return res
          .status(400)
          .json({
            error:
              'userId and productId are required',
          })
      }

      const wishlistItem =
        await prisma.wishlist.upsert({
          where: {
            userId_productId: {
              userId:
                String(
                  userId
                ),

              productId:
                String(
                  productId
                ),
            },
          },

          update: {},

          create: {
            userId:
              String(
                userId
              ),

            productId:
              String(
                productId
              ),
          },

          include: {
            product:
              true,
          },
        })

      return res
        .status(201)
        .json(
          wishlistItem
        )
    } catch (error) {
      console.error(
        'Add to wishlist error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to add to wishlist',
        })
    }
  }
)


router.delete(
  '/wishlist/:userId/:productId',
  async (req, res) => {
    try {
      const userId =
        getSingleString(
          req.params.userId
        )

      const productId =
        getSingleString(
          req.params.productId
        )

      if (
        !userId ||
        !productId
      ) {
        return res
          .status(400)
          .json({
            error:
              'Valid userId and productId are required',
          })
      }

      await prisma.wishlist.deleteMany({
        where: {
          userId,
          productId,
        },
      })

      return res.json({
        success:
          true,
      })
    } catch (error) {
      console.error(
        'Remove from wishlist error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to remove from wishlist',
        })
    }
  }
)


/**
 * =========================================================
 * CREATE PRODUCT
 * =========================================================
 */
router.post(
  '/',
  async (req, res) => {
    try {
      const data =
        req.body

      if (
        !data.name ||
        data.price === undefined ||
        !data.sellerId ||
        !data.categoryId
      ) {
        return res
          .status(400)
          .json({
            error:
              'name, price, sellerId and categoryId are required',
          })
      }

      const parsedPrice =
        Number(
          data.price
        )

      if (
        !Number.isFinite(
          parsedPrice
        ) ||
        parsedPrice <= 0
      ) {
        return res
          .status(400)
          .json({
            error:
              'price must be greater than zero',
          })
      }

      const newProduct =
        await prisma.product.create({
          data: {
            name:
              String(
                data.name
              ),

            description:
              String(
                data.description ||
                  ''
              ),

            price:
              parsedPrice,

            discount:
              Number(
                data.discount ||
                  0
              ),

            craftType:
              data.craftType ||
              null,

            inventory:
              Number.parseInt(
                String(
                  data.inventory ||
                    0
                ),
                10
              ) || 0,

            tags:
              Array.isArray(
                data.tags
              )
                ? data.tags.map(
                    String
                  )
                : [],

            materials:
              Array.isArray(
                data.materials
              )
                ? data.materials.map(
                    String
                  )
                : [],

            brand:
              data.brand
                ? String(
                    data.brand
                  )
                : null,

            currency:
              data.currency
                ? String(
                    data.currency
                  )
                : 'INR',

            sellerId:
              String(
                data.sellerId
              ),

            categoryId:
              String(
                data.categoryId
              ),

            subcategoryId:
              data.subcategoryId
                ? String(
                    data.subcategoryId
                  )
                : null,

            brandId:
              data.brandId
                ? String(
                    data.brandId
                  )
                : null,

            images: {
              create:
                Array.isArray(
                  data.images
                )
                  ? data.images
                      .filter(
                        (
                          url: unknown
                        ) =>
                          typeof url ===
                            'string' &&
                          url.trim()
                            .length >
                            0
                      )
                      .map(
                        (
                          url: string
                        ) => ({
                          url:
                            url.trim(),
                        })
                      )
                  : [],
            },
          },

          include: {
            images:
              true,

            seller:
              true,

            category:
              true,
          },
        })

      return res
        .status(201)
        .json(
          newProduct
        )
    } catch (error) {
      console.error(
        'Create product error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to create product',

          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
    }
  }
)


/**
 * =========================================================
 * GET PRODUCT BY ID
 * =========================================================
 *
 * Keep the dynamic route last.
 */
router.get(
  '/:id',
  async (req, res) => {
    try {
      const id =
        getSingleString(
          req.params.id
        )

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              'Valid product ID is required',
          })
      }

      const product =
        await prisma.product.findUnique({
          where: {
            id,
          },

          include: {
            images:
              true,

            seller: {
              select: {
                id:
                  true,

                businessName:
                  true,

                firstName:
                  true,

                rating:
                  true,

                isNewSeller:
                  true,
              },
            },

            category:
              true,

            subcategory:
              true,

            brandRelation:
              true,
          },
        })

      if (!product) {
        return res
          .status(404)
          .json({
            error:
              'Product not found',
          })
      }

      return res.json(
        product
      )
    } catch (error) {
      console.error(
        'Fetch product error:',
        error
      )

      return res
        .status(500)
        .json({
          error:
            'Failed to fetch product',

          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
    }
  }
)


export default router