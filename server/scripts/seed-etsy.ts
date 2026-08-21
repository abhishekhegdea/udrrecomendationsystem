import {
  createReadStream,
  existsSync,
} from 'fs'

import {
  homedir,
} from 'os'

import {
  basename,
  isAbsolute,
  join,
  resolve,
} from 'path'

import {
  parse,
} from 'csv-parse'

import bcrypt from 'bcryptjs'

import {
  prisma,
} from '../src/db'


interface EtsyRow {
  url?: string
  name?: string
  price?: string
  currency?: string
  availability?: string
  description?: string
  category?: string
  brand?: string
  average_rating?: string
  reviews_count?: string
  images?: string
  product_details?: string
  scraped_at?: string
}


const MAX_PRODUCTS =
  Number.parseInt(
    process.env
      .ETSY_MAX_PRODUCTS ||
      '10000',
    10
  ) || 10000


const BATCH_SIZE =
  100


function resolveCsvPath():
  string {
  const envPath =
    process.env
      .ETSY_CSV_PATH
      ?.trim()

  const candidates: string[] =
    []

  if (envPath) {
    candidates.push(
      isAbsolute(
        envPath
      )
        ? envPath
        : resolve(
            process.cwd(),
            envPath
          )
    )
  }

  /**
   * Run from server/
   */
  candidates.push(
    resolve(
      process.cwd(),
      'etsy.csv'
    )
  )

  /**
   * Repository root:
   *
   * udrrecomendationsystem/etsy.csv
   */
  candidates.push(
    resolve(
      process.cwd(),
      '..',
      'etsy.csv'
    )
  )

  candidates.push(
    resolve(
      process.cwd(),
      '..',
      'data',
      'etsy.csv'
    )
  )

  /**
   * Common macOS locations.
   */
  candidates.push(
    join(
      homedir(),
      'Downloads',
      'etsy.csv'
    )
  )

  candidates.push(
    join(
      homedir(),
      'Downloads',
      'etsy.csv',
      'etsy.csv'
    )
  )

  candidates.push(
    join(
      homedir(),
      'Desktop',
      'etsy.csv'
    )
  )

  const uniqueCandidates =
    Array.from(
      new Set(
        candidates
      )
    )

  for (
    const candidate
    of uniqueCandidates
  ) {
    if (
      existsSync(
        candidate
      )
    ) {
      return candidate
    }
  }

  console.error('')
  console.error(
    '❌ Etsy CSV could not be found.'
  )
  console.error('')
  console.error(
    'Checked these locations:'
  )

  for (
    const candidate
    of uniqueCandidates
  ) {
    console.error(
      `  - ${candidate}`
    )
  }

  console.error('')
  console.error(
    'Either copy etsy.csv into the repository root or run:'
  )

  console.error('')

  console.error(
    'ETSY_CSV_PATH="/full/path/to/etsy.csv" npm run seed:etsy'
  )

  console.error('')

  throw new Error(
    'etsy.csv not found'
  )
}


function cleanHtml(
  html: string
): string {
  return html
    .replace(
      /<br\s*\/?>/gi,
      '\n'
    )
    .replace(
      /<[^>]+>/g,
      ''
    )
    .replace(
      /&nbsp;/g,
      ' '
    )
    .replace(
      /&amp;/g,
      '&'
    )
    .replace(
      /&lt;/g,
      '<'
    )
    .replace(
      /&gt;/g,
      '>'
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/g,
      "'"
    )
    .replace(
      /&#x2F;/g,
      '/'
    )
    .replace(
      /\s+\n/g,
      '\n'
    )
    .replace(
      /\n\s+/g,
      '\n'
    )
    .trim()
}


function getTopCategory(
  categoryPath?: string
): string {
  if (
    !categoryPath?.trim()
  ) {
    return 'Uncategorized'
  }

  const parts =
    categoryPath
      .split(
        /<|>/
      )
      .map(
        (part) =>
          part.trim()
      )
      .filter(
        Boolean
      )

  return (
    parts[0] ||
    'Uncategorized'
  )
}


function splitImages(
  imageString?: string
): string[] {
  if (
    !imageString?.trim()
  ) {
    return []
  }

  let values: string[]

  if (
    imageString.includes(
      '~'
    )
  ) {
    values =
      imageString.split(
        '~'
      )
  } else if (
    imageString.includes(
      '|'
    )
  ) {
    values =
      imageString.split(
        '|'
      )
  } else {
    values = [
      imageString,
    ]
  }

  return values
    .map(
      (url) =>
        url.trim()
    )
    .filter(
      (url) =>
        /^https?:\/\//i.test(
          url
        )
    )
    .map(
      (url) =>
        url.substring(
          0,
          500
        )
    )
}


function parsePrice(
  value?: string
):
  number | null {
  if (!value) {
    return null
  }

  /**
   * Handles values such as:
   *
   * 1299.00
   * ₹1,299.00
   * $42.50
   */
  const cleaned =
    value.replace(
      /[^0-9.-]/g,
      ''
    )

  const price =
    Number.parseFloat(
      cleaned
    )

  if (
    !Number.isFinite(
      price
    ) ||
    price <= 0
  ) {
    return null
  }

  return price
}


function parseRating(
  value?: string
): number {
  const rating =
    Number.parseFloat(
      value || ''
    )

  if (
    !Number.isFinite(
      rating
    )
  ) {
    return 0
  }

  return Math.max(
    0,
    Math.min(
      5,
      rating
    )
  )
}


function parseReviews(
  value?: string
): number {
  if (!value) {
    return 0
  }

  const cleaned =
    value.replace(
      /[^0-9]/g,
      ''
    )

  const reviews =
    Number.parseInt(
      cleaned,
      10
    )

  if (
    !Number.isFinite(
      reviews
    )
  ) {
    return 0
  }

  return Math.max(
    0,
    reviews
  )
}


function getInventory(
  availability?: string
): number {
  const value =
    (
      availability ||
      ''
    )
      .trim()
      .toLowerCase()

  if (
    value.includes(
      'outofstock'
    ) ||
    value.includes(
      'out of stock'
    ) ||
    value ===
      'false'
  ) {
    return 0
  }

  /**
   * Catalog test inventory.
   */
  return (
    Math.floor(
      Math.random() *
        50
    ) + 1
  )
}


function createProductKey(
  name: string,
  brand: string,
  price: number
): string {
  return [
    name
      .trim()
      .toLowerCase(),

    brand
      .trim()
      .toLowerCase(),

    price.toFixed(
      2
    ),
  ].join(
    '::'
  )
}


async function ensureUsers() {
  const adminPassword =
    await bcrypt.hash(
      'Admin@123',
      10
    )

  await prisma.user.upsert({
    where: {
      email:
        'admin@udrcrafts.com',
    },

    update: {},

    create: {
      firstName:
        'Admin',

      lastName:
        'User',

      email:
        'admin@udrcrafts.com',

      password:
        adminPassword,

      role:
        'ADMIN',

      phone:
        '9999999990',
    },
  })

  const buyerPassword =
    await bcrypt.hash(
      'Buyer@123',
      10
    )

  await prisma.user.upsert({
    where: {
      email:
        'buyer@udrcrafts.com',
    },

    update: {},

    create: {
      firstName:
        'Test',

      lastName:
        'Buyer',

      email:
        'buyer@udrcrafts.com',

      password:
        buyerPassword,

      role:
        'CUSTOMER',

      phone:
        '9999999991',
    },
  })
}


async function main() {
  console.log('')
  console.log(
    '========================================'
  )
  console.log(
    '🌱 UdrCrafts Etsy catalog import'
  )
  console.log(
    '========================================'
  )

  const csvPath =
    resolveCsvPath()

  console.log(
    `📁 CSV: ${csvPath}`
  )

  console.log(
    `📄 File: ${basename(csvPath)}`
  )

  console.log(
    `📦 Maximum rows: ${MAX_PRODUCTS}`
  )

  /**
   * -----------------------------------------------------
   * Read CSV
   * -----------------------------------------------------
   */
  const records:
    EtsyRow[] = []

  const parser =
    createReadStream(
      csvPath,
      {
        encoding:
          'utf-8',
      }
    ).pipe(
      parse({
        columns:
          true,

        relax_column_count:
          true,

        skip_records_with_error:
          true,

        skip_empty_lines:
          true,

        bom:
          true,

        trim:
          false,
      })
    )

  for await (
    const record
    of parser
  ) {
    records.push(
      record as EtsyRow
    )

    if (
      records.length >=
      MAX_PRODUCTS
    ) {
      break
    }
  }

  console.log(
    `📊 Parsed ${records.length} CSV rows`
  )

  if (
    records.length === 0
  ) {
    throw new Error(
      'CSV contains no readable product rows'
    )
  }

  /**
   * -----------------------------------------------------
   * Existing catalog — protects against duplicates
   * -----------------------------------------------------
   */
  const existingProducts =
    await prisma.product.findMany({
      select: {
        name:
          true,

        brand:
          true,

        price:
          true,

        etsyUrl:
          true,
      },
    })

  const existingUrls =
    new Set<string>()

  const existingKeys =
    new Set<string>()

  for (
    const product
    of existingProducts
  ) {
    if (
      product.etsyUrl
    ) {
      existingUrls.add(
        product.etsyUrl.trim()
      )
    }

    existingKeys.add(
      createProductKey(
        product.name,
        product.brand ||
          'Unknown',
        product.price
      )
    )
  }

  console.log(
    `🗃️ Existing products: ${existingProducts.length}`
  )

  /**
   * -----------------------------------------------------
   * Categories
   * -----------------------------------------------------
   */
  const categoryNames =
    new Set<string>()

  const brandNames =
    new Set<string>()

  for (
    const record
    of records
  ) {
    categoryNames.add(
      getTopCategory(
        record.category
      )
    )

    const brand =
      record.brand
        ?.trim()

    if (brand) {
      brandNames.add(
        brand
      )
    }
  }

  const categoryMap =
    new Map<
      string,
      string
    >()

  for (
    const categoryName
    of categoryNames
  ) {
    const category =
      await prisma.category.upsert({
        where: {
          name:
            categoryName,
        },

        update: {},

        create: {
          name:
            categoryName,

          description:
            `Products in ${categoryName}`,
        },
      })

    categoryMap.set(
      categoryName,
      category.id
    )
  }

  console.log(
    `🏷️ Categories ready: ${categoryMap.size}`
  )

  /**
   * -----------------------------------------------------
   * Brands
   * -----------------------------------------------------
   */
  const brandIdMap =
    new Map<
      string,
      string
    >()

  for (
    const brandName
    of brandNames
  ) {
    const brand =
      await prisma.brand.upsert({
        where: {
          name:
            brandName,
        },

        update: {},

        create: {
          name:
            brandName,
        },
      })

    brandIdMap.set(
      brandName,
      brand.id
    )
  }

  console.log(
    `🏷️ Brands ready: ${brandIdMap.size}`
  )

  /**
   * -----------------------------------------------------
   * Sellers
   * -----------------------------------------------------
   */
  const sellerPassword =
    await bcrypt.hash(
      'Seller@123',
      10
    )

  const sellerMap =
    new Map<
      string,
      string
    >()

  let sellerIndex =
    0

  for (
    const brandName
    of brandNames
  ) {
    sellerIndex += 1

    const safeIndex =
      sellerIndex
        .toString()
        .padStart(
          7,
          '0'
        )

    const email =
      `etsy-seller-${sellerIndex}@udrcrafts.com`

    const seller =
      await prisma.seller.upsert({
        where: {
          email,
        },

        update: {
          businessName:
            brandName,
        },

        create: {
          firstName:
            brandName
              .split(
                /\s+/
              )[0] ||
            'Etsy',

          lastName:
            brandName
              .split(
                /\s+/
              )
              .slice(
                1
              )
              .join(
                ' '
              ) ||
            'Seller',

          email,

          phone:
            `7${safeIndex}00`.substring(
              0,
              10
            ),

          password:
            sellerPassword,

          businessName:
            brandName,

          status:
            'VERIFIED',

          isNewSeller:
            sellerIndex %
              4 ===
            0,

          rating:
            4.0,
        },
      })

    sellerMap.set(
      brandName,
      seller.id
    )
  }

  const defaultSeller =
    await prisma.seller.upsert({
      where: {
        email:
          'default-etsy@udrcrafts.com',
      },

      update: {},

      create: {
        firstName:
          'Etsy',

        lastName:
          'Artisan',

        email:
          'default-etsy@udrcrafts.com',

        phone:
          '7999999999',

        password:
          sellerPassword,

        businessName:
          'Etsy Artisan',

        status:
          'VERIFIED',

        isNewSeller:
          false,

        rating:
          4.0,
      },
    })

  console.log(
    `👤 Sellers ready: ${sellerMap.size + 1}`
  )

  /**
   * -----------------------------------------------------
   * Products
   * -----------------------------------------------------
   */
  let importedCount =
    0

  let duplicateCount =
    0

  let invalidCount =
    0

  let failedCount =
    0

  let batch: any[] =
    []

  async function flushBatch() {
    if (
      batch.length === 0
    ) {
      return
    }

    const currentBatch =
      batch

    batch = []

    try {
      await prisma.$transaction(
        currentBatch.map(
          (
            productData
          ) =>
            prisma.product.create({
              data:
                productData,
            })
        )
      )

      importedCount +=
        currentBatch.length
    } catch (error) {
      console.warn(
        '⚠️ Batch insert failed; retrying individually.'
      )

      for (
        const productData
        of currentBatch
      ) {
        try {
          await prisma.product.create({
            data:
              productData,
          })

          importedCount +=
            1
        } catch (
          individualError
        ) {
          failedCount +=
            1

          console.error(
            `❌ Failed: ${productData.name}`,
            individualError
          )
        }
      }
    }

    process.stdout.write(
      `\r📦 Imported ${importedCount} products`
    )
  }

  for (
    const record
    of records
  ) {
    const name =
      record.name
        ?.trim()

    const price =
      parsePrice(
        record.price
      )

    if (
      !name ||
      price === null
    ) {
      invalidCount +=
        1

      continue
    }

    const categoryName =
      getTopCategory(
        record.category
      )

    const categoryId =
      categoryMap.get(
        categoryName
      )

    if (!categoryId) {
      invalidCount +=
        1

      continue
    }

    const brand =
      record.brand
        ?.trim() ||
      'Unknown'

    const etsyUrl =
      record.url
        ?.trim() ||
      null

    const duplicateKey =
      createProductKey(
        name,
        brand,
        price
      )

    if (
      (
        etsyUrl &&
        existingUrls.has(
          etsyUrl
        )
      ) ||
      existingKeys.has(
        duplicateKey
      )
    ) {
      duplicateCount +=
        1

      continue
    }

    const sellerId =
      sellerMap.get(
        brand
      ) ||
      defaultSeller.id

    const brandId =
      brandIdMap.get(
        brand
      ) ||
      null

    const averageRating =
      parseRating(
        record.average_rating
      )

    const reviewsCount =
      parseReviews(
        record.reviews_count
      )

    const imageUrls =
      splitImages(
        record.images
      )

    const description =
      cleanHtml(
        record.description ||
          record.product_details ||
          name
      )
        .substring(
          0,
          4000
        )

    /**
     * Simple popularity proxy for catalog sorting.
     */
    const popularity =
      averageRating *
      Math.log1p(
        Math.max(
          reviewsCount,
          1
        )
      )

    const productData = {
      name,

      description,

      price,

      currency:
        record.currency
          ?.trim() ||
        'USD',

      brand,

      brandId,

      averageRating,

      reviewsCount,

      etsyUrl,

      inventory:
        getInventory(
          record.availability
        ),

      popularity,

      sellerId,

      categoryId,

      tags: [
        categoryName,
        brand,
      ].filter(
        Boolean
      ),

      materials:
        [],

      images: {
        create:
          imageUrls.map(
            (url) => ({
              url,
            })
          ),
      },
    }

    batch.push(
      productData
    )

    /**
     * Add to duplicate sets immediately so duplicate rows
     * within the same CSV are also skipped.
     */
    existingKeys.add(
      duplicateKey
    )

    if (etsyUrl) {
      existingUrls.add(
        etsyUrl
      )
    }

    if (
      batch.length >=
      BATCH_SIZE
    ) {
      await flushBatch()
    }
  }

  await flushBatch()

  console.log('')
  console.log('')
  console.log(
    '========================================'
  )
  console.log(
    '✅ Etsy catalog import complete'
  )
  console.log(
    '========================================'
  )

  console.log(
    `Imported:   ${importedCount}`
  )

  console.log(
    `Duplicates: ${duplicateCount}`
  )

  console.log(
    `Invalid:    ${invalidCount}`
  )

  console.log(
    `Failed:     ${failedCount}`
  )

  await ensureUsers()

  const finalProductCount =
    await prisma.product.count()

  const finalCategoryCount =
    await prisma.category.count()

  const finalSellerCount =
    await prisma.seller.count()

  console.log('')
  console.log(
    'Database totals:'
  )

  console.log(
    `Products:   ${finalProductCount}`
  )

  console.log(
    `Categories: ${finalCategoryCount}`
  )

  console.log(
    `Sellers:    ${finalSellerCount}`
  )

  if (
    finalProductCount ===
    0
  ) {
    throw new Error(
      'Seed completed but Product table is still empty'
    )
  }
}


main()
  .catch(
    (error) => {
      console.error('')
      console.error(
        '❌ Seed failed'
      )

      console.error(
        error
      )

      process.exitCode =
        1
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect()
    }
  )