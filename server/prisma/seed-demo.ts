import * as bcrypt from 'bcryptjs'
import { prisma } from '../src/db'

async function main() {
  console.log('🧹 Wiping existing data...')
  
  // Wipe in correct foreign key order
  await prisma.clickEvent.deleteMany()
  await prisma.productView.deleteMany()
  await prisma.recommendationLog.deleteMany()
  await prisma.searchHistory.deleteMany()
  await prisma.cartItem.deleteMany()
  await prisma.wishlist.deleteMany()
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.rating.deleteMany()
  await prisma.review.deleteMany()
  
  await prisma.productImage.deleteMany()
  await prisma.product.deleteMany()
  await prisma.sellerScore.deleteMany()
  await prisma.seller.deleteMany()
  await prisma.deliveryPartner.deleteMany()
  
  await prisma.subcategory.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()

  console.log('✅ Database wiped.')

  const passwordHash = await bcrypt.hash('Admin@123', 10)
  const passwordHashBuyer = await bcrypt.hash('Buyer@123', 10)
  const passwordHashSeller = await bcrypt.hash('Seller@123', 10)

  // 1. Create Admin
  const admin = await prisma.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@udrcrafts.com',
      password: passwordHash,
      role: 'ADMIN'
    }
  })
  console.log('👤 Created Admin Account')

  // 2. Create Categories
  const catNames = ['Wood Craft', 'Home Decor', 'Jewellery', 'Pottery', 'Handloom', 'Bamboo', 'Metal Art', 'Wall Decor', 'Painting', 'Gift Items']
  const categories = await Promise.all(
    catNames.map(name => prisma.category.create({ data: { name } }))
  )
  const getCat = (name: string) => categories.find(c => c.name === name)!.id

  // 3. Create Sellers
  const sellersData = [
    { firstName: 'Ramesh', lastName: 'Kumar', businessName: 'Saharanpur Woodworks', email: 'ramesh@udrcrafts.com', city: 'Saharanpur', state: 'Uttar Pradesh' },
    { firstName: 'Sunita', lastName: 'Devi', businessName: 'Jaipur Gems', email: 'sunita@udrcrafts.com', city: 'Jaipur', state: 'Rajasthan' },
    { firstName: 'Mohan', lastName: 'Lal', businessName: 'Khurja Pottery', email: 'mohan@udrcrafts.com', city: 'Khurja', state: 'Uttar Pradesh' },
    { firstName: 'Priya', lastName: 'Sharma', businessName: 'Madhubani Arts', email: 'priya@udrcrafts.com', city: 'Madhubani', state: 'Bihar' },
    { firstName: 'Lakshmi', lastName: 'Narayanan', businessName: 'Kanchipuram Silks', email: 'lakshmi@udrcrafts.com', city: 'Kanchipuram', state: 'Tamil Nadu' }
  ]

  const sellers = await Promise.all(
    sellersData.map((s, i) => prisma.seller.create({
      data: {
        firstName: s.firstName,
        lastName: s.lastName,
        businessName: s.businessName,
        email: s.email,
        phone: `99999999${i}1`,
        password: passwordHashSeller,
        status: 'VERIFIED',
        isNewSeller: false,
        rating: 4.5 + (i * 0.1),
        panNumber: 'ABCDE1234F',
        aadhaarNumber: '123456789012'
      }
    }))
  )
  console.log('🏪 Created 5 Sellers')

  // 4. Create 40 Products
  const productsData = [
    // Ramesh (Woodworks)
    { sellerId: sellers[0].id, name: 'Handcarved Wooden Elephant', description: 'Intricate rosewood carving from Saharanpur', price: 1200, categoryId: getCat('Wood Craft'), img: 'https://images.unsplash.com/photo-1602498456745-e9503b30470b?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Teakwood Pooja Temple', description: 'Traditional wooden temple for home', price: 4500, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1629837947137-b4d081f21626?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Wooden Coaster Set', description: 'Set of 6 engraved wood coasters', price: 450, categoryId: getCat('Wood Craft'), img: 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Carved Coffee Table', description: 'Handcrafted solid wood coffee table', price: 8500, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Wooden Jewelry Box', description: 'Polished walnut wood storage box', price: 1100, categoryId: getCat('Wood Craft'), img: 'https://images.unsplash.com/photo-1610996162125-9f57f4dc10b6?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Antique Wall Clock', description: 'Vintage wooden pendulum clock', price: 3200, categoryId: getCat('Wall Decor'), img: 'https://images.unsplash.com/photo-1506543730435-e2c1d0f5075e?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Wooden Serving Tray', description: 'Mango wood tray with handles', price: 899, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1616782297123-5e76d9fec0e3?q=80&w=500' },
    { sellerId: sellers[0].id, name: 'Bamboo Lamp Shade', description: 'Eco-friendly bamboo weaving', price: 1500, categoryId: getCat('Bamboo'), img: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?q=80&w=500' },

    // Sunita (Jewellery/Metal)
    { sellerId: sellers[1].id, name: 'Silver Filigree Earrings', description: 'Handcrafted sterling silver earrings', price: 2500, categoryId: getCat('Jewellery'), img: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Meenakari Necklace Set', description: 'Traditional Rajasthani Kundan set', price: 5500, categoryId: getCat('Jewellery'), img: 'https://images.unsplash.com/photo-1599643478524-fb66f70a00ea?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Oxidized Silver Bangle', description: 'Tribal design adjustable bangle', price: 950, categoryId: getCat('Jewellery'), img: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Brass Vintage Lantern', description: 'Hand-hammered decorative lantern', price: 2100, categoryId: getCat('Metal Art'), img: 'https://images.unsplash.com/photo-1522066113264-7fc53bc9697a?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Copper Water Jug', description: 'Ayurvedic pure copper pitcher', price: 1400, categoryId: getCat('Metal Art'), img: 'https://images.unsplash.com/photo-1565191295350-f8d227b7bbfb?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Gold Plated Jhumka', description: 'Bridal wear traditional jhumkas', price: 3400, categoryId: getCat('Jewellery'), img: 'https://images.unsplash.com/photo-1629224316810-9d8805b95e76?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Brass Camel Figurine', description: 'Rajasthani metal craft', price: 800, categoryId: getCat('Gift Items'), img: 'https://images.unsplash.com/photo-1632731174697-3a1ab9bdf209?q=80&w=500' },
    { sellerId: sellers[1].id, name: 'Peacock Ring', description: 'Enamel painted statement ring', price: 650, categoryId: getCat('Jewellery'), img: 'https://images.unsplash.com/photo-1605100804763-247f67b2548e?q=80&w=500' },

    // Mohan (Pottery)
    { sellerId: sellers[2].id, name: 'Blue Pottery Clay Vase', description: 'Classic Khurja ceramic vase', price: 800, categoryId: getCat('Pottery'), img: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Terracotta Tea Set', description: 'Clay tea cups and kettle set of 6', price: 1200, categoryId: getCat('Pottery'), img: 'https://images.unsplash.com/photo-1579624508493-27732a39d892?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Ceramic Dinner Plates', description: 'Hand-painted floral dinnerware', price: 2400, categoryId: getCat('Pottery'), img: 'https://images.unsplash.com/photo-1613589410313-09419cf5c777?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Clay Incense Holder', description: 'Minimalist agarbatti stand', price: 300, categoryId: getCat('Gift Items'), img: 'https://images.unsplash.com/photo-1605553094894-6d9b04fc9209?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Glazed Coffee Mug', description: 'Oversized ceramic studio mug', price: 450, categoryId: getCat('Pottery'), img: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Hanging Planter Basket', description: 'Macrame and clay indoor planter', price: 950, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Decorative Clay Bells', description: 'Handmade wind chimes', price: 550, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1596489311442-992a7e287413?q=80&w=500' },
    { sellerId: sellers[2].id, name: 'Large Floor Vase', description: 'Terracotta corner decor piece', price: 3500, categoryId: getCat('Pottery'), img: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?q=80&w=500' },

    // Priya (Paintings)
    { sellerId: sellers[3].id, name: 'Madhubani Village Painting', description: 'Authentic folk art on canvas', price: 3500, categoryId: getCat('Painting'), img: 'https://images.unsplash.com/photo-1577083165350-13bc3d67bc82?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Warli Wall Art', description: 'Tribal Maharashtra wall decor', price: 1500, categoryId: getCat('Wall Decor'), img: 'https://images.unsplash.com/photo-1579547621113-e4bb2a19bdd6?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Pichwai Cow Canvas', description: 'Traditional Nathdwara style painting', price: 4200, categoryId: getCat('Painting'), img: 'https://images.unsplash.com/photo-1580226244673-90d5bcda6a60?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Abstract Landscape', description: 'Modern acrylic on canvas', price: 2800, categoryId: getCat('Painting'), img: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Gond Tribal Art', description: 'Colorful dots and lines nature motif', price: 1900, categoryId: getCat('Wall Decor'), img: 'https://images.unsplash.com/photo-1582201942988-13e60e4556ee?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Miniature Rajasthani Art', description: 'Fine brushwork on silk', price: 5000, categoryId: getCat('Painting'), img: 'https://images.unsplash.com/photo-1578301978018-3005759f48f7?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Hand-painted Tapestry', description: 'Fabric wall hanging decor', price: 2200, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1550508933-728b9d36e2f1?q=80&w=500' },
    { sellerId: sellers[3].id, name: 'Buddha Portrait', description: 'Serene watercolor painting', price: 3100, categoryId: getCat('Painting'), img: 'https://images.unsplash.com/photo-1596766442650-6fc540453303?q=80&w=500' },

    // Lakshmi (Handloom)
    { sellerId: sellers[4].id, name: 'Pure Cotton Handloom Saree', description: 'Breathable hand-woven summer saree', price: 2200, categoryId: getCat('Handloom'), img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Banarasi Silk Dupatta', description: 'Rich zari work festive dupatta', price: 1800, categoryId: getCat('Handloom'), img: 'https://images.unsplash.com/photo-1583391733958-69345ee921f9?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Kanjeevaram Bridal Silk', description: 'Heavy gold border traditional silk', price: 15000, categoryId: getCat('Handloom'), img: 'https://images.unsplash.com/photo-1605908906963-718816f1aef5?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Block Print Bedsheet', description: 'Jaipuri print pure cotton double sheet', price: 1600, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Embroidered Cushion Covers', description: 'Set of 4 mirror work pillows', price: 850, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e6?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Ikat Woven Scarf', description: 'Soft cotton geometric pattern stole', price: 600, categoryId: getCat('Handloom'), img: 'https://images.unsplash.com/photo-1580870059868-faa4d6182c4f?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Pashmina Wool Shawl', description: 'Authentic Kashmiri winter wrap', price: 6500, categoryId: getCat('Handloom'), img: 'https://images.unsplash.com/photo-1520638069352-78d1073801ec?q=80&w=500' },
    { sellerId: sellers[4].id, name: 'Hand-knotted Wool Rug', description: 'Traditional carpet for living room', price: 12500, categoryId: getCat('Home Decor'), img: 'https://images.unsplash.com/photo-1600166898405-da9535204843?q=80&w=500' }
  ]

  const products = await Promise.all(
    productsData.map(p => prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        price: p.price,
        inventory: 20,
        popularity: Math.random() * 100,
        sellerId: p.sellerId,
        categoryId: p.categoryId,
        images: { create: [{ url: p.img }] }
      }
    }))
  )
  console.log('📦 Created 10 Products')

  // Helper to find product by keyword
  const findProduct = (keyword: string) => products.find(p => p.name.includes(keyword))!.id

  // 5. Create 5 Buyers
  const buyersData = [
    { firstName: 'Amit', lastName: 'Patel', email: 'amit@udrcrafts.com', interest: 'Wood' },
    { firstName: 'Neha', lastName: 'Singh', email: 'neha@udrcrafts.com', interest: 'Jewellery' },
    { firstName: 'Rajesh', lastName: 'Sharma', email: 'rajesh@udrcrafts.com', interest: 'Pottery' },
    { firstName: 'Kavita', lastName: 'Verma', email: 'kavita@udrcrafts.com', interest: 'Paintings' },
    { firstName: 'Sneha', lastName: 'Iyer', email: 'sneha@udrcrafts.com', interest: 'Handloom' }
  ]

  const buyers = await Promise.all(
    buyersData.map((b, i) => prisma.user.create({
      data: {
        firstName: b.firstName,
        lastName: b.lastName,
        email: b.email,
        password: passwordHashBuyer,
        phone: `88888888${i}1`,
        role: 'CUSTOMER'
      }
    }))
  )
  console.log('🛒 Created 5 Buyers')

  // 6. Simulate Behavior (Views, Wishlist, Orders, Searches)
  
  // Buyer 1: Wood
  const b1 = buyers[0].id
  await prisma.productView.create({ data: { userId: b1, productId: findProduct('Elephant'), timeSpent: 45 } })
  await prisma.productView.create({ data: { userId: b1, productId: findProduct('Temple'), timeSpent: 120 } })
  await prisma.wishlist.create({ data: { userId: b1, productId: findProduct('Temple') } })
  await prisma.searchHistory.create({ data: { userId: b1, query: 'wooden decor' } })
  const order1 = await prisma.order.create({ data: { userId: b1, totalAmount: 1200, status: 'CONFIRMED' } })
  await prisma.orderItem.create({ data: { orderId: order1.id, productId: findProduct('Elephant'), quantity: 1, priceAtBuy: 1200 } })

  // Buyer 2: Jewellery
  const b2 = buyers[1].id
  await prisma.productView.create({ data: { userId: b2, productId: findProduct('Earrings'), timeSpent: 80 } })
  await prisma.productView.create({ data: { userId: b2, productId: findProduct('Necklace'), timeSpent: 200 } })
  await prisma.wishlist.create({ data: { userId: b2, productId: findProduct('Necklace') } })
  await prisma.searchHistory.create({ data: { userId: b2, query: 'silver earrings' } })
  const order2 = await prisma.order.create({ data: { userId: b2, totalAmount: 2500, status: 'DELIVERED' } })
  await prisma.orderItem.create({ data: { orderId: order2.id, productId: findProduct('Earrings'), quantity: 1, priceAtBuy: 2500 } })

  // Buyer 3: Pottery
  const b3 = buyers[2].id
  await prisma.productView.create({ data: { userId: b3, productId: findProduct('Vase'), timeSpent: 60 } })
  await prisma.productView.create({ data: { userId: b3, productId: findProduct('Tea Set'), timeSpent: 90 } })
  await prisma.searchHistory.create({ data: { userId: b3, query: 'clay vase' } })
  const order3 = await prisma.order.create({ data: { userId: b3, totalAmount: 800, status: 'CONFIRMED' } })
  await prisma.orderItem.create({ data: { orderId: order3.id, productId: findProduct('Vase'), quantity: 1, priceAtBuy: 800 } })

  // Buyer 4: Paintings
  const b4 = buyers[3].id
  await prisma.productView.create({ data: { userId: b4, productId: findProduct('Madhubani'), timeSpent: 150 } })
  await prisma.productView.create({ data: { userId: b4, productId: findProduct('Warli'), timeSpent: 100 } })
  await prisma.wishlist.create({ data: { userId: b4, productId: findProduct('Madhubani') } })
  await prisma.searchHistory.create({ data: { userId: b4, query: 'wall paintings' } })
  const order4 = await prisma.order.create({ data: { userId: b4, totalAmount: 1500, status: 'SHIPPED' } })
  await prisma.orderItem.create({ data: { orderId: order4.id, productId: findProduct('Warli'), quantity: 1, priceAtBuy: 1500 } })

  // Buyer 5: Handloom
  const b5 = buyers[4].id
  await prisma.productView.create({ data: { userId: b5, productId: findProduct('Saree'), timeSpent: 300 } })
  await prisma.productView.create({ data: { userId: b5, productId: findProduct('Dupatta'), timeSpent: 120 } })
  await prisma.wishlist.create({ data: { userId: b5, productId: findProduct('Dupatta') } })
  await prisma.searchHistory.create({ data: { userId: b5, query: 'sarees' } })
  const order5 = await prisma.order.create({ data: { userId: b5, totalAmount: 2200, status: 'DELIVERED' } })
  await prisma.orderItem.create({ data: { orderId: order5.id, productId: findProduct('Saree'), quantity: 1, priceAtBuy: 2200 } })

  console.log('🎯 Simulated Behavior Inserted Successfully.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
