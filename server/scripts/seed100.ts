import { prisma } from '../src/db';
import { faker } from '@faker-js/faker';

const craftTypes = ['Blue Pottery', 'Weaving', 'Wood Carving', 'Metalwork', 'Terracotta', 'Painting', 'Embroidery'];
const tagsList = ['vintage', 'modern', 'sustainable', 'luxury', 'gift', 'handmade', 'local', 'traditional'];
const materialsList = ['Cotton', 'Silk', 'Teakwood', 'Clay', 'Brass', 'Copper', 'Glass'];
const imageAssets = [
  '/products/product-vase.jpg',
  '/products/product-shawl.jpg',
  '/products/product-box.jpg',
  '/products/product-lamp.jpg',
  '/products/product-planter.jpg',
  '/products/product-painting.jpg'
];

async function main() {
  console.log('Seeding 100 products...');

  // Get existing categories and sellers to map products to
  const categories = await prisma.category.findMany();
  const sellers = await prisma.seller.findMany();

  if (categories.length === 0 || sellers.length === 0) {
    console.log('Ensure you have at least one Category and Seller in the DB first!');
    return;
  }

  const productsData = [];

  for (let i = 0; i < 100; i++) {
    const category = categories[faker.number.int({ min: 0, max: categories.length - 1 })];
    const seller = sellers[faker.number.int({ min: 0, max: sellers.length - 1 })];
    const imageUrl = imageAssets[faker.number.int({ min: 0, max: imageAssets.length - 1 })];

    productsData.push({
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price({ min: 100, max: 10000 })),
      discount: faker.number.int({ min: 0, max: 20 }),
      inventory: faker.number.int({ min: 1, max: 50 }),
      craftType: craftTypes[faker.number.int({ min: 0, max: craftTypes.length - 1 })],
      tags: faker.helpers.arrayElements(tagsList, 3),
      materials: faker.helpers.arrayElements(materialsList, 2),
      categoryId: category.id,
      sellerId: seller.id,
      // Create images dynamically for this product
      images: {
        create: [{ url: imageUrl }]
      }
    });
  }

  // Create products sequentially to include images properly
  for (const pData of productsData) {
    await prisma.product.create({
      data: pData
    });
  }

  console.log('Successfully seeded 100 products!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
