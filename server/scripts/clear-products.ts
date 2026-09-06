import { prisma } from '../src/db'

async function clearProducts() {
  console.log('🗑️  Starting cleanup of all products and dependent records...')

  try {
    console.log('⏳ Clearing recommendation score snapshots...')
    const snap = await prisma.recommendationScoreSnapshot.deleteMany({})
    console.log(`   ✓ Removed ${snap.count} score snapshots`)

    console.log('⏳ Clearing seasonal scores...')
    const seasonal = await prisma.seasonalScore.deleteMany({})
    console.log(`   ✓ Removed ${seasonal.count} seasonal scores`)

    console.log('⏳ Clearing trending scores...')
    const trending = await prisma.trendingScore.deleteMany({})
    console.log(`   ✓ Removed ${trending.count} trending scores`)

    console.log('⏳ Clearing product click history...')
    const clickHistory = await prisma.productClickHistory.deleteMany({})
    console.log(`   ✓ Removed ${clickHistory.count} click history entries`)

    console.log('⏳ Clearing click events...')
    const clicks = await prisma.clickEvent.deleteMany({})
    console.log(`   ✓ Removed ${clicks.count} click events`)

    console.log('⏳ Clearing product views...')
    const views = await prisma.productView.deleteMany({})
    console.log(`   ✓ Removed ${views.count} product views`)

    console.log('⏳ Clearing product interactions from user behaviour...')
    const behaviours = await prisma.userBehaviour.deleteMany({
      where: { productId: { not: null } }
    })
    console.log(`   ✓ Removed ${behaviours.count} user behaviour events`)

    console.log('⏳ Clearing reviews...')
    const reviews = await prisma.review.deleteMany({})
    console.log(`   ✓ Removed ${reviews.count} reviews`)

    console.log('⏳ Clearing ratings...')
    const ratings = await prisma.rating.deleteMany({})
    console.log(`   ✓ Removed ${ratings.count} ratings`)

    console.log('⏳ Clearing cart items...')
    const cart = await prisma.cartItem.deleteMany({})
    console.log(`   ✓ Removed ${cart.count} cart items`)

    console.log('⏳ Clearing wishlist items...')
    const wishlist = await prisma.wishlist.deleteMany({})
    console.log(`   ✓ Removed ${wishlist.count} wishlist items`)

    console.log('⏳ Clearing order items...')
    const orderItems = await prisma.orderItem.deleteMany({})
    console.log(`   ✓ Removed ${orderItems.count} order items`)

    console.log('⏳ Clearing product images...')
    const images = await prisma.productImage.deleteMany({})
    console.log(`   ✓ Removed ${images.count} product images`)

    console.log('⏳ Deleting all products...')
    const products = await prisma.product.deleteMany({})
    console.log(`   ✓ Removed ${products.count} products`)

    console.log('\n=============================================')
    console.log('🎉 All products and related records removed successfully!')
    console.log(`   Total Products Deleted: ${products.count}`)
    console.log('=============================================')
  } catch (error) {
    console.error('❌ Error while clearing products:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

clearProducts()
