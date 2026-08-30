import { prisma } from './src/db.js';

async function dedupe() {
  console.log('Fetching all products...');
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
    }
  });

  console.log(`Found ${products.length} total products.`);

  const nameToIds = new Map<string, string[]>();
  for (const product of products) {
    if (!nameToIds.has(product.name)) {
      nameToIds.set(product.name, []);
    }
    nameToIds.get(product.name)!.push(product.id);
  }

  const idsToDelete: { dupId: string, primaryId: string }[] = [];
  
  for (const [name, ids] of nameToIds.entries()) {
    if (ids.length > 1) {
      const primaryId = ids[0];
      for (let i = 1; i < ids.length; i++) {
        idsToDelete.push({ dupId: ids[i], primaryId });
      }
    }
  }

  console.log(`Found ${idsToDelete.length} duplicates to delete.`);

  let count = 0;
  for (const { dupId, primaryId } of idsToDelete) {
    try {
      // Reassign foreign keys
      await prisma.orderItem.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      
      try { await prisma.wishlist.updateMany({ where: { productId: dupId }, data: { productId: primaryId } }); } catch(e) { await prisma.wishlist.deleteMany({ where: { productId: dupId } }); }
      try { await prisma.cartItem.updateMany({ where: { productId: dupId }, data: { productId: primaryId } }); } catch(e) { await prisma.cartItem.deleteMany({ where: { productId: dupId } }); }
      
      await prisma.rating.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      await prisma.review.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      await prisma.productView.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      await prisma.clickEvent.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      await prisma.userBehaviour.updateMany({ where: { productId: dupId }, data: { productId: primaryId } });
      await prisma.trendingScore.deleteMany({ where: { productId: dupId } });
      await prisma.seasonalScore.deleteMany({ where: { productId: dupId } });

      // Delete the duplicate
      await prisma.product.delete({ where: { id: dupId } });
      count++;
      if (count % 500 === 0) console.log(`Deleted ${count} duplicates...`);
    } catch (error: any) {
      console.error(`Failed to delete ${dupId}:`, error.message);
    }
  }

  console.log(`Deduplication complete! Deleted ${count} products.`);
}

dedupe()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
