import { prisma } from '../src/db'

async function seedSampleDiscounts() {
  console.log('🏷️  Applying realistic discounts across product catalog...')

  try {
    const products = await prisma.product.findMany({
      select: { id: true, price: true },
      take: 8000, // Apply discounts to first 8,000 products
    })

    console.log(`Found ${products.length} products to populate with discounts...`)

    const discountTiers = [10, 15, 20, 25, 30, 40, 50]
    let updatedCount = 0

    // Batch update
    for (let i = 0; i < products.length; i++) {
      // 70% chance of receiving a discount in this sample set
      if (i % 3 !== 0) {
        const discount = discountTiers[i % discountTiers.length]
        await prisma.product.update({
          where: { id: products[i].id },
          data: { discount },
        })
        updatedCount++
      }
    }

    console.log(`✅ Successfully assigned discounts to ${updatedCount} products!`)
  } catch (error) {
    console.error('❌ Error updating discounts:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedSampleDiscounts()
