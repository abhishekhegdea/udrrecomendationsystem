import { prisma } from '../src/db'


type ProductSample = {
  id: string
  name: string
  brand: string | null
  price: number
  currency: string

  category: {
    name: string
  }

  seller: {
    businessName: string | null
  }

  images: Array<{
    id?: string
    url: string
  }>
}


async function main() {
  console.log('')
  console.log(
    'UdrCrafts Catalog Check'
  )

  console.log(
    '======================='
  )

  const [
    productCount,
    categoryCount,
    sellerCount,
  ] =
    await Promise.all([
      prisma.product.count(),

      prisma.category.count(),

      prisma.seller.count(),
    ])


  console.log(
    `Products:   ${productCount}`
  )

  console.log(
    `Categories: ${categoryCount}`
  )

  console.log(
    `Sellers:    ${sellerCount}`
  )


  /**
   * ---------------------------------------------------------
   * EMPTY DATABASE
   * ---------------------------------------------------------
   */

  if (productCount === 0) {
    console.log('')
    console.log(
      '❌ Product table is empty.'
    )

    console.log('')
    console.log(
      'The Browse Products page cannot display products because there are no Product records in PostgreSQL.'
    )

    console.log('')
    console.log(
      'Run:'
    )

    console.log(
      'npm run seed:etsy'
    )

    return
  }


  /**
   * ---------------------------------------------------------
   * GET SAMPLE PRODUCTS
   * ---------------------------------------------------------
   */

  const samples =
    await prisma.product.findMany({
      take: 5,

      include: {
        category: {
          select: {
            name: true,
          },
        },

        seller: {
          select: {
            businessName:
              true,
          },
        },

        images: {
          take: 1,

          select: {
            id:
              true,

            url:
              true,
          },
        },
      },

      orderBy: {
        createdAt:
          'desc',
      },
    })


  /**
   * Prisma normally infers this automatically.
   *
   * Explicit typing is being used here because your
   * current TypeScript/Prisma configuration is treating
   * the callback arguments as implicit any.
   */
  const typedSamples =
    samples as ProductSample[]


  console.log('')
  console.log(
    'Sample products:'
  )


  typedSamples.forEach(
    (
      product: ProductSample,
      index: number
    ) => {
      console.log('')

      console.log(
        `${index + 1}. ${product.name}`
      )

      console.log(
        `   ID: ${product.id}`
      )

      console.log(
        `   Brand: ${
          product.brand ||
          '-'
        }`
      )

      console.log(
        `   Category: ${
          product.category
            ?.name ||
          '-'
        }`
      )

      console.log(
        `   Seller: ${
          product.seller
            ?.businessName ||
          '-'
        }`
      )

      console.log(
        `   Price: ${product.price} ${product.currency}`
      )

      console.log(
        `   Images: ${product.images.length}`
      )

      if (
        product.images.length >
        0
      ) {
        console.log(
          `   First image: ${product.images[0]?.url}`
        )
      }
    }
  )


  /**
   * ---------------------------------------------------------
   * FINAL RESULT
   * ---------------------------------------------------------
   */

  console.log('')
  console.log(
    '======================='
  )

  console.log(
    '✅ Product catalog exists.'
  )

  console.log(
    `✅ ${productCount} products available.`
  )

  console.log(
    '======================='
  )
}


main()
  .catch(
    (error: unknown) => {
      console.error('')
      console.error(
        '❌ Catalog check failed'
      )

      if (
        error instanceof Error
      ) {
        console.error(
          error.message
        )

        console.error(
          error.stack
        )
      } else {
        console.error(
          String(error)
        )
      }

      process.exitCode = 1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )