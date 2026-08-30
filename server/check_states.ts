import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const statesCount = await prisma.state.count();
  const citiesCount = await prisma.city.count();
  console.log(`States: ${statesCount}, Cities: ${citiesCount}`);
  
  if (statesCount === 0) {
    console.log("Seeding states and cities...");
    const country = await prisma.country.create({
      data: { name: 'India' }
    });
    
    const state = await prisma.state.create({
      data: { name: 'Maharashtra', countryId: country.id }
    });
    
    await prisma.city.create({
      data: { name: 'Mumbai', stateId: state.id }
    });
    
    const state2 = await prisma.state.create({
      data: { name: 'Delhi', countryId: country.id }
    });
    
    await prisma.city.create({
      data: { name: 'New Delhi', stateId: state2.id }
    });
    
    console.log("Seeded basic data.");
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
