import { prisma } from './src/db.js';

async function getProduct() {
  const p = await prisma.product.findFirst({
    where: { name: { contains: 'Baby Teethers' } },
    include: { seller: true }
  });
  if (!p) {
    console.log('Not found');
    return;
  }
  console.log(`ID: ${p.id}`);
  console.log(`Name: ${p.name}`);
  console.log(`Price: ${p.price}`);
  console.log(`Brand ID: ${p.brandId}`);
  console.log(`Avg Rating: ${p.averageRating}`);
  console.log(`Reviews Count: ${p.reviewsCount}`);
  console.log(`Popularity: ${p.popularity}`);
  console.log(`Seller New: ${p.seller.isNewSeller}`);
  console.log(`Seller Rating: ${p.seller.rating}`);
}

getProduct().finally(() => process.exit(0));
