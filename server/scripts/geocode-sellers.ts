import 'dotenv/config'
import { prisma } from '../src/db'
import { geocodeAddress } from '../src/services/googleMaps'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const sellers = await prisma.seller.findMany({
    where: {
      OR: [{ latitude: null }, { longitude: null }],
    },
    include: {
      city: true,
      state: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  console.log(`Sellers requiring geocoding: ${sellers.length}`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const seller of sellers) {
    // Existing Seller data contains city/state but not a verified street
    // address. Geocode the city/state centroid rather than guessing from the
    // business name. A seller who logs in later can replace this fallback with
    // precise browser coordinates.
    const parts = [
      seller.city?.name,
      seller.state?.name,
      'India',
    ].filter(Boolean)

    const address = parts.join(', ')

    if (!seller.city?.name && !seller.state?.name) {
      console.log(`SKIP ${seller.id}: seller has no city/state.`)
      skipped += 1
      continue
    }

    try {
      const resolved = await geocodeAddress(address)

      await prisma.seller.update({
        where: { id: seller.id },
        data: {
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          locationAddress: resolved.formattedAddress || address,
          locationUpdatedAt: new Date(),
        },
      })

      updated += 1
      console.log(
        `OK ${seller.businessName || seller.id}: ${resolved.latitude}, ${resolved.longitude}`
      )

      // Gentle pacing for bulk backfills.
      await sleep(80)
    } catch (error) {
      failed += 1
      console.error(`FAIL ${seller.id} (${address})`, error)
    }
  }

  console.log({ updated, skipped, failed })
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
