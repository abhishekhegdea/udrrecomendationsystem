import { prisma } from '../src/db'
import bcrypt from 'bcryptjs'

async function main() {
  console.log('Seeding database...')

  // 1. Create Sellers
  const seller1 = await prisma.seller.upsert({
    where: { email: 'meera@udrcrafts.com' },
    update: {},
    create: {
      firstName: 'Meera',
      lastName: 'Rajput',
      email: 'meera@udrcrafts.com',
      phone: '9876543210',
      password: await bcrypt.hash('password123', 10),
      businessName: 'Meera Studio',
      isNewSeller: true,
      status: 'VERIFIED',
    },
  })

  const seller2 = await prisma.seller.upsert({
    where: { email: 'kashmir@udrcrafts.com' },
    update: {},
    create: {
      firstName: 'Tariq',
      lastName: 'Ahmad',
      email: 'kashmir@udrcrafts.com',
      phone: '9876543211',
      password: await bcrypt.hash('password123', 10),
      businessName: 'Kashmir Looms',
      isNewSeller: false,
      status: 'VERIFIED',
    },
  })

  // 2. Create Categories
  const categories = [
    { name: 'Furniture', description: 'Handcrafted wooden and metallic furniture.' },
    { name: 'Home Decor', description: 'Exquisite items to decorate your home.' },
    { name: 'Textiles', description: 'Woven garments, shawls, and fabrics.' },
    { name: 'Art & Paintings', description: 'Canvas, Madhubani, and regional art.' },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    })
  }

  const decorCat = await prisma.category.findUnique({ where: { name: 'Home Decor' } })
  const textCat = await prisma.category.findUnique({ where: { name: 'Textiles' } })
  const furnCat = await prisma.category.findUnique({ where: { name: 'Furniture' } })
  const artCat = await prisma.category.findUnique({ where: { name: 'Art & Paintings' } })

  // 3. Create Products
  const products = [
    {
      name: 'Jaipur Blue Pottery Vase',
      description: 'A beautiful handcrafted vase made with authentic Jaipur blue pottery techniques. Perfect for living rooms.',
      price: 1200,
      materials: ['Ceramic', 'Blue Dye', 'Clay'],
      tags: ['decor', 'vase', 'blue', 'pottery'],
      categoryId: decorCat!.id,
      sellerId: seller1.id,
      inventory: 15,
      craftType: 'Blue Pottery'
    },
    {
      name: 'Handwoven Pashmina Shawl',
      description: 'Authentic 100% Pashmina shawl, handwoven by artisans in Kashmir. Features intricate embroidery and extreme warmth.',
      price: 4500,
      materials: ['Pashmina Wool', 'Silk Thread'],
      tags: ['clothing', 'shawl', 'winter', 'luxury'],
      categoryId: textCat!.id,
      sellerId: seller2.id,
      inventory: 5,
      craftType: 'Weaving'
    },
    {
      name: 'Carved Teakwood Box',
      description: 'Intricately carved teakwood jewelry box with velvet lining inside. Ideal for storing valuables.',
      price: 850,
      materials: ['Teak Wood', 'Velvet'],
      tags: ['box', 'wood', 'storage', 'carved'],
      categoryId: furnCat!.id,
      sellerId: seller1.id,
      inventory: 20,
      craftType: 'Wood Carving'
    },
    {
      name: 'Brass Vintage Lamp',
      description: 'A traditional Moradabad brass lamp that brings a vintage aesthetic to any room. Includes modern electrical fittings.',
      price: 2100,
      materials: ['Brass', 'Glass'],
      tags: ['lamp', 'lighting', 'brass', 'vintage'],
      categoryId: decorCat!.id,
      sellerId: seller2.id,
      inventory: 8,
      craftType: 'Metalwork'
    },
    {
      name: 'Madhubani Canvas Painting',
      description: 'Traditional Madhubani art depicting village life, painted on high-quality canvas using natural dyes.',
      price: 3200,
      materials: ['Canvas', 'Natural Dyes'],
      tags: ['art', 'painting', 'madhubani', 'wall'],
      categoryId: artCat!.id,
      sellerId: seller1.id,
      inventory: 3,
      craftType: 'Painting'
    }
  ]

  for (const prod of products) {
    // Check if exists
    const existing = await prisma.product.findFirst({ where: { name: prod.name } })
    if (!existing) {
      await prisma.product.create({ data: prod })
    }
  }

  // 4. Dummy Customer
  const customer = await prisma.user.upsert({
    where: { email: 'buyer@example.com' },
    update: {},
    create: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'buyer@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'CUSTOMER',
      phone: '5551234567'
    }
  })

  console.log('Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
