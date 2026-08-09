import { prisma } from '../src/db'
import { createReadStream } from 'fs'
import { parse } from 'csv-parse'
import bcrypt from 'bcryptjs'

const CSV_PATH = process.env.ETSY_CSV_PATH || 'D:/Downloads/etsy.csv/etsy.csv'
const MAX_PRODUCTS = parseInt(process.env.ETSY_MAX_PRODUCTS || '10000', 10)
const BATCH_SIZE = 100

interface EtsyRow {
  url: string
  name: string
  price: string
  currency: string
  availability: string
  description: string
  category: string
  brand: string
  average_rating: string
  reviews_count: string
  images: string
  product_details: string
  scraped_at: string
}

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .trim()
}

function getTopCategory(categoryPath: string): string {
  if (!categoryPath) return 'Uncategorized'
  // Category format: "Parent < Subcategory < Subsubcategory"
  const parts = categoryPath.split(/<|>/).map(p => p.trim()).filter(Boolean)
  return parts[0] || 'Uncategorized'
}

function splitImages(imageStr: string): string[] {
  if (!imageStr) return []
  // Images are separated by ~ (tilde)
  return imageStr.split('~').map(u => u.trim()).filter(u => u.length > 0 && u.startsWith('http'))
}

async function main() {
  console.log('🌱 Seeding database from Etsy CSV...')
  console.log(`📁 Path: ${CSV_PATH}`)
  console.log(`📦 Max products: ${MAX_PRODUCTS}`)

  // 1. Parse CSV
  const records: EtsyRow[] = []
  const parser = createReadStream(CSV_PATH, { encoding: 'utf-8' }).pipe(
    parse({
      columns: true,
      relax_column_count: true,
      skip_records_with_error: true,
      bom: true,
    })
  )

  for await (const record of parser) {
    records.push(record as EtsyRow)
    if (records.length >= MAX_PRODUCTS) break
  }

  console.log(`📊 Parsed ${records.length} records from CSV`)

  // 2. Extract unique categories & brands
  const categoryNames = new Set<string>()
  const brandNames = new Set<string>()

  for (const record of records) {
    const catName = getTopCategory(record.category)
    if (catName) categoryNames.add(catName)
    if (record.brand?.trim()) brandNames.add(record.brand.trim())
  }

  console.log(`🏷️ Found ${categoryNames.size} unique categories`)
  console.log(`🏪 Found ${brandNames.size} unique brands`)

  // 3. Create/Get categories
  const categoryMap = new Map<string, string>()
  for (const catName of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { name: catName },
      update: {},
      create: { name: catName, description: `Products from Etsy in ${catName}` },
    })
    categoryMap.set(catName, cat.id)
  }
  console.log(`✅ Ensured ${categoryMap.size} categories exist`)

  // 4. Create/Get sellers from brands
  const passwordHash = await bcrypt.hash('Seller@123', 10)
  const sellerMap = new Map<string, string>()

  let sellerIndex = 0
  for (const brand of brandNames) {
    const email = `etsy-seller-${sellerIndex}@udrcrafts.com`
    sellerIndex++
    try {
      const seller = await prisma.seller.upsert({
        where: { email },
        update: { businessName: brand },
        create: {
          firstName: brand.split(' ')[0] || 'Etsy',
          lastName: brand.split(' ').slice(1).join(' ') || 'Seller',
          email,
          phone: `555${String(sellerIndex + 1000).padStart(7, '0')}`,
          password: passwordHash,
          businessName: brand,
          status: 'VERIFIED',
          isNewSeller: true,
          rating: 4.0,
        },
      })
      sellerMap.set(brand, seller.id)
    } catch (err) {
      console.error(`Failed to create seller for brand "${brand}":`, err)
    }
  }

  // Also create a default fallback seller (use a unique phone that won't conflict)
  const defaultSeller = await prisma.seller.upsert({
    where: { email: 'default-etsy@udrcrafts.com' },
    update: {},
    create: {
      firstName: 'Etsy',
      lastName: 'Seller',
      email: 'default-etsy@udrcrafts.com',
      phone: '5559999999',
      password: passwordHash,
      businessName: 'Etsy Artisan',
      status: 'VERIFIED',
      isNewSeller: false,
      rating: 4.0,
    },
  })

  console.log(`✅ Ensured ${sellerMap.size + 1} sellers exist (${sellerMap.size} brands + 1 default)`)

  // 5. Import products
  let importedCount = 0
  let skippedCount = 0
  let batch: any[] = []

  for (let i = 0; i < records.length; i++) {
    const record = records[i]

    const name = record.name?.trim()
    const price = parseFloat(record.price)
    if (!name || isNaN(price) || price <= 0) {
      skippedCount++
      if (skippedCount <= 5) console.log(`⏭️ Skipping row ${i + 2}: invalid name/price (name="${name}", price=${record.price})`)
      continue
    }

    const description = cleanHtml(record.description || record.product_details || '')
    const categoryName = getTopCategory(record.category)
    const categoryId = categoryMap.get(categoryName)
    const brand = record.brand?.trim() || 'Unknown'
    const sellerId = sellerMap.get(brand) || defaultSeller.id
    const imageUrls = splitImages(record.images)
    const inventory = record.availability === 'InStock' ? Math.floor(Math.random() * 50) + 1 : 0
    const averageRating = parseFloat(record.average_rating) || 0
    const reviewsCount = parseInt(record.reviews_count) || 0

    if (!categoryId) {
      skippedCount++
      continue
    }

    batch.push({
      name,
      description: description.substring(0, 2000),
      price,
      currency: record.currency || 'USD',
      brand,
      averageRating,
      reviewsCount,
      etsyUrl: record.url?.trim() || null,
      inventory,
      popularity: averageRating * (reviewsCount || 1),
      sellerId,
      categoryId,
      tags: [categoryName],
      images: {
        create: imageUrls.map(url => ({ url: url.substring(0, 500) })),
      },
    })

    importedCount++

    // Batch insert using transaction for performance
    if (batch.length >= BATCH_SIZE) {
      try {
        await prisma.$transaction(
          batch.map(productData => prisma.product.create({ data: productData }))
        )
      } catch (err) {
        console.error(`\n❌ Batch insert failed at product ${importedCount}:`, err)
        // Fall back to individual inserts
        for (const productData of batch) {
          try {
            await prisma.product.create({ data: productData })
          } catch (innerErr) {
            console.error(`Failed to create product "${productData.name}":`, innerErr)
          }
        }
      }
      batch = []
      process.stdout.write(`\r📦 Imported ${importedCount} products...`)
    }
  }

  // Insert remaining products
  if (batch.length > 0) {
    try {
      await prisma.$transaction(
        batch.map(productData => prisma.product.create({ data: productData }))
      )
    } catch (err) {
      console.error(`\n❌ Final batch insert failed:`, err)
      for (const productData of batch) {
        try {
          await prisma.product.create({ data: productData })
        } catch (innerErr) {
          console.error(`Failed to create product "${productData.name}":`, innerErr)
        }
      }
    }
  }

  console.log(`\n✅ Import complete!`)
  console.log(`   📦 Imported: ${importedCount} products`)
  console.log(`   ⏭️  Skipped: ${skippedCount} rows`)  // 6. Create admin account
  const adminEmail = 'admin@udrcrafts.com'
  const adminPassword = await bcrypt.hash('Admin@123', 10)
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        email: adminEmail,
        password: adminPassword,
        role: 'ADMIN',
        phone: '9999999990'
      }
    })
    console.log('👤 Created admin account (admin@udrcrafts.com / Admin@123)')
  } else {
    console.log('👤 Admin account already exists')
  }

  // 7. Create a sample buyer for testing
  const buyerEmail = 'buyer@udrcrafts.com'
  const buyerPassword = await bcrypt.hash('Buyer@123', 10)
  const existingBuyer = await prisma.user.findUnique({ where: { email: buyerEmail } })
  if (!existingBuyer) {
    await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'Buyer',
        email: buyerEmail,
        password: buyerPassword,
        role: 'CUSTOMER',
        phone: '9999999991'
      }
    })
    console.log('👤 Created test buyer (buyer@udrcrafts.com / Buyer@123)')
  }

  console.log(`📊 Total in DB: ${await prisma.product.count()}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
phone: '9999999990'
      }
    })
console.log('👤 Created admin account (admin@udrcrafts.com / Admin@123)')
  } else {
  console.log('👤 Admin account already exists')
}

// 7. Create a sample buyer for testing
const buyerEmail = 'buyer@udrcrafts.com'
const buyerPassword = await bcrypt.hash('Buyer@123', 10)
const existingBuyer = await prisma.user.findUnique({ where: { email: buyerEmail } })
if (!existingBuyer) {
  await prisma.user.create({
    data: {
      firstName: 'Test',
      lastName: 'Buyer',
      email: buyerEmail,
      password: buyerPassword,
      role: 'CUSTOMER',
      phone: '9999999991'
    }
  })
  console.log('👤 Created test buyer (buyer@udrcrafts.com / Buyer@123)')
}

console.log(`📊 Total in DB: ${await prisma.product.count()}`)
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
