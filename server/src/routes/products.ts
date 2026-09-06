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

    const minDiscount =
      getOptionalNumber(
        req.query.minDiscount
      )

    const hasDiscount =
      req.query.hasDiscount === 'true' ||
      req.query.discountOnly === 'true'

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

    if (
      minDiscount !== undefined &&
      minDiscount > 0
    ) {
      filters.push({
        discount: {
          gte:
            minDiscount,
        },
      })
    } else if (hasDiscount) {
      filters.push({
        discount: {
          gt: 0,
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

                trustBadge:
                  true,

                sellerTrustScore:
                  true,

                dispatchSlaScore:
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

      const product = await prisma.product.findUnique({
        where: { id: String(productId) },
        select: { categoryId: true, brandId: true },
      })

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

          update: {
            categoryId: product?.categoryId,
            brandId: product?.brandId,
          },

          create: {
            userId:
              String(
                userId
              ),

            productId:
              String(
                productId
              ),

            categoryId: product?.categoryId,
            brandId: product?.brandId,
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

                trustBadge:
                  true,

                sellerTrustScore:
                  true,

                dispatchSlaScore:
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


/**
 * =========================================================
 * SUBMIT PRODUCT REVIEW & RATING
 * =========================================================
 * POST /api/products/:id/reviews
 *
 * Validates delivered order requirement, atomically saves Rating + Review,
 * recalculates Product.averageRating & reviewsCount, and updates Seller.rating.
 */
router.post(
  '/:id/reviews',
  async (req, res) => {
    try {
      const id =
        getSingleString(
          req.params.id
        )
      const { rating, text, userId, orderId } =
        req.body || {}

      if (!id) {
        return res
          .status(400)
          .json({
            error:
              'Valid product ID is required',
          })
      }

      const ratingVal = Number(rating)
      if (
        !Number.isInteger(ratingVal) ||
        ratingVal < 1 ||
        ratingVal > 5
      ) {
        return res
          .status(400)
          .json({
            error:
              'Rating must be an integer between 1 and 5',
          })
      }

      if (!userId || typeof userId !== 'string') {
        return res
          .status(400)
          .json({
            error:
              'User ID is required',
          })
      }

      const product =
        await prisma.product.findUnique({
          where: { id },
          select: {
            id: true,
            sellerId: true,
            categoryId: true,
            brandId: true,
            averageRating: true,
            reviewsCount: true,
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

      // Verify user has delivered order for this product
      const deliveredOrder =
        await prisma.order.findFirst({
          where: {
            userId,
            status: 'DELIVERED',
            ...(orderId ? { id: orderId } : {}),
            items: {
              some: {
                productId: id,
              },
            },
          },
        })

      if (!deliveredOrder) {
        return res
          .status(403)
          .json({
            error:
              'Only customers who have received this product can submit a verified review',
          })
      }

      // Execute atomic rating + review creation and product/seller rating recalculation
      const result =
        await prisma.$transaction(
          async (tx) => {
            // 1. Upsert Rating
            const existingRating =
              await tx.rating.findFirst({
                where: {
                  userId,
                  productId: id,
                },
              })

            let savedRating
            if (existingRating) {
              savedRating =
                await tx.rating.update({
                  where: {
                    id: existingRating.id,
                  },
                  data: {
                    value: ratingVal,
                    categoryId:
                      product.categoryId,
                    brandId:
                      product.brandId,
                  },
                })
            } else {
              savedRating =
                await tx.rating.create({
                  data: {
                    value: ratingVal,
                    userId,
                    productId: id,
                    categoryId:
                      product.categoryId,
                    brandId:
                      product.brandId,
                  },
                })
            }

            // 2. Upsert Review (if text provided or update existing)
            const existingReview =
              await tx.review.findFirst({
                where: {
                  userId,
                  productId: id,
                },
              })

            let savedReview = null
            if (
              text &&
              typeof text === 'string' &&
              text.trim()
            ) {
              if (existingReview) {
                savedReview =
                  await tx.review.update({
                    where: {
                      id: existingReview.id,
                    },
                    data: {
                      text: text.trim(),
                      categoryId:
                        product.categoryId,
                    },
                  })
              } else {
                savedReview =
                  await tx.review.create({
                    data: {
                      text: text.trim(),
                      userId,
                      productId: id,
                      categoryId:
                        product.categoryId,
                    },
                  })
              }
            }

            // 3. Recalculate Product Total Average Rating & Reviews Count
            // Exact Formula:
            // New Average = ((Current Average * Total Ratings) + New Rating) / (Total Ratings + 1)
            const currentAverage = product.averageRating || 0
            const totalRatings = product.reviewsCount || 0
            const newRating = ratingVal

            let newReviewsCount: number
            let newAverageRating: number

            if (existingRating) {
              // User is updating their previously submitted rating
              const prevRatingVal = existingRating.value
              const currentSum = (currentAverage * totalRatings) - prevRatingVal + newRating
              newReviewsCount = Math.max(1, totalRatings)
              newAverageRating = Number((currentSum / newReviewsCount).toFixed(1))
            } else {
              // Exact Formula for new rating:
              // New Average = ((Current Average * Total Ratings) + New Rating) / (Total Ratings + 1)
              if (totalRatings > 0 && currentAverage > 0) {
                newReviewsCount = totalRatings + 1
                newAverageRating = Number((((currentAverage * totalRatings) + newRating) / (totalRatings + 1)).toFixed(1))
              } else {
                newReviewsCount = 1
                newAverageRating = Number(newRating.toFixed(1))
              }
            }

            // Ensure average rating is clamped safely between 1.0 and 5.0
            newAverageRating = Math.max(1.0, Math.min(5.0, newAverageRating))

            const updatedProduct =
              await tx.product.update({
                where: { id },
                data: {
                  averageRating:
                    newAverageRating,
                  reviewsCount:
                    newReviewsCount,
                },
                select: {
                  id: true,
                  averageRating: true,
                  reviewsCount: true,
                },
              })

            // 4. Recalculate Seller Average Rating across all products
            const sellerProducts =
              await tx.product.findMany({
                where: {
                  sellerId:
                    product.sellerId,
                },
                select: {
                  averageRating: true,
                  reviewsCount: true,
                },
              })

            let totalWeightedRating = 0
            let totalProductReviews = 0
            for (const sp of sellerProducts) {
              if (
                sp.reviewsCount > 0 &&
                sp.averageRating > 0
              ) {
                totalWeightedRating +=
                  sp.averageRating *
                  sp.reviewsCount
                totalProductReviews +=
                  sp.reviewsCount
              }
            }

            const sellerAvgRating =
              totalProductReviews > 0
                ? Number(
                    (
                      totalWeightedRating /
                      totalProductReviews
                    ).toFixed(2)
                  )
                : Number(ratingVal.toFixed(2))

            await tx.seller.update({
              where: {
                id: product.sellerId,
              },
              data: {
                rating:
                  sellerAvgRating,
              },
            })

            // 5. Create UserBehaviour ML Event
            await tx.userBehaviour.create({
              data: {
                userId,
                eventType: 'RATING',
                productId: id,
                categoryId:
                  product.categoryId,
                sellerId:
                  product.sellerId,
                brandId:
                  product.brandId,
                source:
                  'delivered_order_review',
                metadata: {
                  rating: ratingVal,
                  reviewText: text
                    ? text.trim()
                    : null,
                  orderId:
                    deliveredOrder.id,
                },
              },
            })

            return {
              rating: savedRating,
              review: savedReview,
              product: updatedProduct,
            }
          }
        )

      // Fire-and-forget ML event sync to Python ML service if running
      try {
        fetch(
          'http://localhost:8000/api/v1/events/rating',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              user_id: userId,
              product_id: id,
              rating_value: ratingVal,
              source:
                'delivered_order_review',
              metadata: {
                reviewText:
                  text || null,
                orderId:
                  deliveredOrder.id,
              },
            }),
          }
        ).catch(() => {})
      } catch {
        // Non-blocking
      }

      return res.status(201).json({
        message:
          'Review and rating submitted successfully',
        rating: result.rating,
        review: result.review,
        averageRating:
          result.product.averageRating,
        reviewsCount:
          result.product.reviewsCount,
      })
    } catch (error) {
      console.error(
        'Submit review error:',
        error
      )
      return res.status(500).json({
        error:
          'Failed to submit review',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      })
    }
  }
)


/**
 * =========================================================
 * GET PRODUCT REVIEWS & STAR DISTRIBUTION
 * =========================================================
 * GET /api/products/:id/reviews
 */
router.get(
  '/:id/reviews',
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

      const [reviews, ratings, product] =
        await Promise.all([
          prisma.review.findMany({
            where: { productId: id },
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          }),
          prisma.rating.findMany({
            where: { productId: id },
            select: {
              userId: true,
              value: true,
            },
          }),
          prisma.product.findUnique({
            where: { id },
            select: {
              averageRating: true,
              reviewsCount: true,
            },
          }),
        ])

      if (!product) {
        return res
          .status(404)
          .json({
            error:
              'Product not found',
          })
      }

      // Map user ratings to reviews
      const ratingMap = new Map<
        string,
        number
      >()
      const distribution: Record<
        number,
        number
      > = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      }
      for (const r of ratings) {
        ratingMap.set(
          r.userId,
          r.value
        )
        if (r.value >= 1 && r.value <= 5) {
          distribution[r.value] =
            (distribution[r.value] ||
              0) + 1
        }
      }

      // Preserve full volume distribution based on total reviews count and average rating
      const totalReviewsCount =
        product.reviewsCount || ratings.length || 0
      const effectiveAvg =
        product.averageRating || 0
      const dbRatingsCount =
        ratings.length
      const remainder =
        Math.max(
          0,
          totalReviewsCount -
            dbRatingsCount
        )

      if (remainder > 0 && effectiveAvg > 0) {
        if (effectiveAvg >= 4.0) {
          const frac = Math.min(1.0, Math.max(0.0, effectiveAvg - 4.0))
          const fiveStarCount = Math.round(remainder * frac)
          const fourStarCount = remainder - fiveStarCount
          distribution[5] += fiveStarCount
          distribution[4] += fourStarCount
        } else if (effectiveAvg >= 3.0) {
          const frac = Math.min(1.0, Math.max(0.0, effectiveAvg - 3.0))
          const fourStarCount = Math.round(remainder * frac)
          const threeStarCount = remainder - fourStarCount
          distribution[4] += fourStarCount
          distribution[3] += threeStarCount
        } else if (effectiveAvg >= 2.0) {
          const frac = Math.min(1.0, Math.max(0.0, effectiveAvg - 2.0))
          const threeStarCount = Math.round(remainder * frac)
          const twoStarCount = remainder - threeStarCount
          distribution[3] += threeStarCount
          distribution[2] += twoStarCount
        } else {
          const frac = Math.min(1.0, Math.max(0.0, effectiveAvg - 1.0))
          const twoStarCount = Math.round(remainder * frac)
          const oneStarCount = remainder - twoStarCount
          distribution[2] += twoStarCount
          distribution[1] += oneStarCount
        }
      }

      const reviewsWithRating =
        reviews.map((rev) => ({
          id: rev.id,
          text: rev.text,
          createdAt: rev.createdAt,
          user: rev.user,
          rating:
            ratingMap.get(
              rev.userId
            ) || 5,
        }))

      return res.json({
        reviews: reviewsWithRating,
        distribution: {
          5: distribution[5],
          4: distribution[4],
          3: distribution[3],
          2: distribution[2],
          1: distribution[1],
          total: totalReviewsCount,
          averageRating:
            product.averageRating,
          reviewsCount:
            product.reviewsCount,
        },
      })
    } catch (error) {
      console.error(
        'Fetch reviews error:',
        error
      )
      return res.status(500).json({
        error:
          'Failed to fetch reviews',
        message:
          error instanceof Error
            ? error.message
            : String(error),
      })
    }
  }
)


/**
 * =========================================================
 * GET USER REVIEW FOR PRODUCT
 * =========================================================
 * GET /api/products/:id/user-review?userId=...
 */
router.get(
  '/:id/user-review',
  async (req, res) => {
    try {
      const id =
        getSingleString(
          req.params.id
        )
      const userId =
        getSingleString(
          req.query.userId
        )

      if (!id || !userId) {
        return res
          .status(400)
          .json({
            error:
              'Product ID and User ID are required',
          })
      }

      const [
        existingRating,
        existingReview,
      ] = await Promise.all([
        prisma.rating.findFirst({
          where: {
            productId: id,
            userId,
          },
        }),
        prisma.review.findFirst({
          where: {
            productId: id,
            userId,
          },
        }),
      ])

      return res.json({
        hasReviewed: !!(
          existingRating ||
          existingReview
        ),
        rating: existingRating
          ? existingRating.value
          : null,
        reviewText: existingReview
          ? existingReview.text
          : null,
      })
    } catch (error) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch user review status',
        })
    }
  }
)


export default router