import { prisma } from '../src/db';

async function main() {
  console.log('🚀 Starting Fast SQL Data Backfill for Brand and Category IDs...');

  // 1. Link Products missing brandId to existing or new Brand rows
  console.log('--- 1. Backfilling Product.brandId ---');
  await prisma.$executeRawUnsafe(`
    UPDATE "Product" p
    SET "brandId" = b.id
    FROM "Brand" b
    WHERE p."brand" IS NOT NULL AND p."brand" = b.name AND p."brandId" IS NULL;
  `);

  // 2. Link Brand.categoryId from Product.categoryId
  console.log('--- 2. Backfilling Brand.categoryId ---');
  const brandsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "Brand" b
    SET "categoryId" = sub."categoryId"
    FROM (
      SELECT DISTINCT ON ("brandId") "brandId", "categoryId"
      FROM "Product"
      WHERE "brandId" IS NOT NULL AND "categoryId" IS NOT NULL
    ) sub
    WHERE b.id = sub."brandId" AND b."categoryId" IS NULL;
  `);
  console.log(`Updated ${brandsUpdated} brands.`);

  // 3. Link CartItem (categoryId, brandId)
  console.log('--- 3. Backfilling CartItem ---');
  const cartUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "CartItem" c
    SET "categoryId" = COALESCE(c."categoryId", p."categoryId"),
        "brandId" = COALESCE(c."brandId", p."brandId")
    FROM "Product" p
    WHERE c."productId" = p.id AND (c."categoryId" IS NULL OR c."brandId" IS NULL);
  `);
  console.log(`Updated ${cartUpdated} cart items.`);

  // 4. Link Wishlist (categoryId, brandId)
  console.log('--- 4. Backfilling Wishlist ---');
  const wishlistUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "Wishlist" w
    SET "categoryId" = COALESCE(w."categoryId", p."categoryId"),
        "brandId" = COALESCE(w."brandId", p."brandId")
    FROM "Product" p
    WHERE w."productId" = p.id AND (w."categoryId" IS NULL OR w."brandId" IS NULL);
  `);
  console.log(`Updated ${wishlistUpdated} wishlist items.`);

  // 5. Link OrderItem (categoryId, brandId)
  console.log('--- 5. Backfilling OrderItem ---');
  const orderItemsUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "OrderItem" oi
    SET "categoryId" = COALESCE(oi."categoryId", p."categoryId"),
        "brandId" = COALESCE(oi."brandId", p."brandId")
    FROM "Product" p
    WHERE oi."productId" = p.id AND (oi."categoryId" IS NULL OR oi."brandId" IS NULL);
  `);
  console.log(`Updated ${orderItemsUpdated} order items.`);

  // 6. Link Order (categoryId, brandId) from OrderItem
  console.log('--- 6. Backfilling Order ---');
  const ordersUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "Order" o
    SET "categoryId" = COALESCE(o."categoryId", sub."categoryId"),
        "brandId" = COALESCE(o."brandId", sub."brandId")
    FROM (
      SELECT DISTINCT ON ("orderId") "orderId", "categoryId", "brandId"
      FROM "OrderItem"
      WHERE "categoryId" IS NOT NULL OR "brandId" IS NOT NULL
    ) sub
    WHERE o.id = sub."orderId" AND (o."categoryId" IS NULL OR o."brandId" IS NULL);
  `);
  console.log(`Updated ${ordersUpdated} orders.`);

  // 7. Link ClickEvent (categoryId, brandId)
  console.log('--- 7. Backfilling ClickEvent ---');
  const clicksUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "ClickEvent" ce
    SET "categoryId" = COALESCE(ce."categoryId", p."categoryId"),
        "brandId" = COALESCE(ce."brandId", p."brandId")
    FROM "Product" p
    WHERE ce."productId" = p.id AND (ce."categoryId" IS NULL OR ce."brandId" IS NULL);
  `);
  console.log(`Updated ${clicksUpdated} click events.`);

  // 8. Link UserBehaviour (categoryId, brandId)
  console.log('--- 8. Backfilling UserBehaviour ---');
  const ubUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "UserBehaviour" ub
    SET "categoryId" = COALESCE(ub."categoryId", p."categoryId"),
        "brandId" = COALESCE(ub."brandId", p."brandId")
    FROM "Product" p
    WHERE ub."productId" = p.id AND (ub."categoryId" IS NULL OR ub."brandId" IS NULL);
  `);
  console.log(`Updated ${ubUpdated} user behaviours.`);

  // 9. Link ProductClickHistory (categoryId)
  console.log('--- 9. Backfilling ProductClickHistory ---');
  const pchUpdated = await prisma.$executeRawUnsafe(`
    UPDATE "ProductClickHistory" pch
    SET "categoryId" = COALESCE(pch."categoryId", p."categoryId")
    FROM "Product" p
    WHERE pch."productId" = p.id AND pch."categoryId" IS NULL;
  `);
  console.log(`Updated ${pchUpdated} product click histories.`);

  console.log('\n🎉 ALL BACKFILLS COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e);
  })
  .finally(() => prisma.$disconnect());
