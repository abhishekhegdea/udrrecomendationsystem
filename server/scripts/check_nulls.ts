import { prisma } from '../src/db';

async function main() {
  const productsTotal = await prisma.product.count();
  const productsNullCat = await prisma.product.count({ where: { categoryId: { equals: undefined } } });
  const productsNullBrandId = await prisma.product.count({ where: { brandId: null } });
  const productsWithBrandString = await prisma.product.count({ where: { brand: { not: null } } });

  const brandsTotal = await prisma.brand.count();
  const brandsNullCat = await prisma.brand.count({ where: { categoryId: null } });

  const ordersTotal = await prisma.order.count();
  const ordersNullCat = await prisma.order.count({ where: { categoryId: null } });
  const ordersNullBrand = await prisma.order.count({ where: { brandId: null } });

  const orderItemsTotal = await prisma.orderItem.count();
  const orderItemsNullCat = await prisma.orderItem.count({ where: { categoryId: null } });
  const orderItemsNullBrand = await prisma.orderItem.count({ where: { brandId: null } });

  const cartTotal = await prisma.cartItem.count();
  const cartNullCat = await prisma.cartItem.count({ where: { categoryId: null } });
  const cartNullBrand = await prisma.cartItem.count({ where: { brandId: null } });

  const wishlistTotal = await prisma.wishlist.count();
  const wishlistNullCat = await prisma.wishlist.count({ where: { categoryId: null } });
  const wishlistNullBrand = await prisma.wishlist.count({ where: { brandId: null } });

  const ratingTotal = await prisma.rating.count();
  const ratingNullCat = await prisma.rating.count({ where: { categoryId: null } });
  const ratingNullBrand = await prisma.rating.count({ where: { brandId: null } });

  const clickTotal = await prisma.clickEvent.count();
  const clickNullCat = await prisma.clickEvent.count({ where: { categoryId: null } });
  const clickNullBrand = await prisma.clickEvent.count({ where: { brandId: null } });

  const ubTotal = await prisma.userBehaviour.count();
  const ubNullCat = await prisma.userBehaviour.count({ where: { categoryId: null } });
  const ubNullBrand = await prisma.userBehaviour.count({ where: { brandId: null } });

  console.log('=== DATA AUDIT ===');
  console.log(JSON.stringify({
    products: { total: productsTotal, nullBrandId: productsNullBrandId, withBrandString: productsWithBrandString },
    brands: { total: brandsTotal, nullCat: brandsNullCat },
    orders: { total: ordersTotal, nullCat: ordersNullCat, nullBrand: ordersNullBrand },
    orderItems: { total: orderItemsTotal, nullCat: orderItemsNullCat, nullBrand: orderItemsNullBrand },
    cart: { total: cartTotal, nullCat: cartNullCat, nullBrand: cartNullBrand },
    wishlist: { total: wishlistTotal, nullCat: wishlistNullCat, nullBrand: wishlistNullBrand },
    ratings: { total: ratingTotal, nullCat: ratingNullCat, nullBrand: ratingNullBrand },
    clicks: { total: clickTotal, nullCat: clickNullCat, nullBrand: clickNullBrand },
    userBehaviour: { total: ubTotal, nullCat: ubNullCat, nullBrand: ubNullBrand }
  }, null, 2));

  // Let's inspect some sample products
  const sampleProducts = await prisma.product.findMany({
    take: 5,
    select: { id: true, name: true, brand: true, brandId: true, categoryId: true }
  });
  console.log('Sample Products:', sampleProducts);

  // Let's inspect sample brands
  const sampleBrands = await prisma.brand.findMany({
    take: 5,
    select: { id: true, name: true, categoryId: true }
  });
  console.log('Sample Brands:', sampleBrands);
}

main().catch(console.error).finally(() => prisma.$disconnect());
