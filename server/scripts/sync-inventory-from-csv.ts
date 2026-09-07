import { createReadStream, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'csv-parse';
import { prisma } from '../src/db';

interface EtsyCsvRow {
  url?: string;
  name?: string;
  price?: string;
  brand?: string;
  availability?: string;
  available_quantity?: string;
}

function getInventory(availability?: string, availableQuantity?: string): number {
  if (availableQuantity !== undefined && availableQuantity !== null && availableQuantity.trim() !== '') {
    const parsed = Number.parseInt(availableQuantity.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  const value = (availability || '').trim().toLowerCase();
  if (value.includes('outofstock') || value.includes('out of stock') || value === 'false') {
    return 0;
  }
  if (value.includes('limitedstock') || value.includes('limited stock')) {
    return Math.floor(Math.random() * 2) + 1;
  }
  return Math.floor(Math.random() * 50) + 1;
}

async function syncInventory() {
  const csvCandidates = [
    resolve(process.cwd(), 'etsy_updated.csv'),
    resolve(process.cwd(), '..', 'etsy_updated.csv'),
    resolve(process.cwd(), 'data', 'etsy_updated.csv'),
    resolve(process.cwd(), '..', 'data', 'etsy_updated.csv'),
  ];

  const csvPath = csvCandidates.find((p) => existsSync(p));
  if (!csvPath) {
    throw new Error('No etsy_updated.csv dataset found');
  }

  console.log(`📁 Reading dataset from: ${csvPath}`);

  const parser = createReadStream(csvPath, { encoding: 'utf-8' }).pipe(
    parse({
      columns: true,
      relax_column_count: true,
      skip_records_with_error: true,
      skip_empty_lines: true,
      bom: true,
    })
  );

  const urlToInventory = new Map<string, number>();
  const nameToInventory = new Map<string, number>();

  let parsedCount = 0;
  for await (const row of parser) {
    const r = row as EtsyCsvRow;
    const inv = getInventory(r.availability, r.available_quantity);
    if (r.url?.trim()) {
      urlToInventory.set(r.url.trim(), inv);
    }
    if (r.name?.trim()) {
      nameToInventory.set(r.name.trim().toLowerCase(), inv);
    }
    parsedCount++;
  }

  console.log(`📊 Parsed ${parsedCount} CSV rows with available_quantity.`);

  // Load all existing products
  const products = await prisma.product.findMany({
    select: { id: true, name: true, etsyUrl: true, inventory: true },
  });

  console.log(`🗃️ Found ${products.length} products in database. Synchronizing inventory...`);

  let updatedCount = 0;
  let batchUpdates: { id: string; inventory: number }[] = [];

  for (const prod of products) {
    let targetInv: number | undefined;
    if (prod.etsyUrl && urlToInventory.has(prod.etsyUrl.trim())) {
      targetInv = urlToInventory.get(prod.etsyUrl.trim());
    } else if (nameToInventory.has(prod.name.trim().toLowerCase())) {
      targetInv = nameToInventory.get(prod.name.trim().toLowerCase());
    }

    if (targetInv !== undefined && prod.inventory !== targetInv) {
      batchUpdates.push({ id: prod.id, inventory: targetInv });
    }
  }

  console.log(`⚡ Updating ${batchUpdates.length} product inventories...`);

  // Execute in batches
  const BATCH_SIZE = 250;
  for (let i = 0; i < batchUpdates.length; i += BATCH_SIZE) {
    const chunk = batchUpdates.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.product.update({
          where: { id: item.id },
          data: { inventory: item.inventory },
        })
      )
    );
    updatedCount += chunk.length;
    process.stdout.write(`\r✅ Updated ${updatedCount} / ${batchUpdates.length} products`);
  }

  console.log(`\n🎉 Successfully synchronized ${updatedCount} product inventories with the dataset!`);
}

syncInventory()
  .catch((err) => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
