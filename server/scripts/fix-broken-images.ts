/**
 * fix-broken-images.ts — data repair for unresolvable placeholder image URLs.
 *
 * A previous seed run stored image URLs on the `synthetic.example` domain
 * (e.g. https://synthetic.example/images/...). That domain does not resolve
 * (`.example` is reserved by RFC 2606), so every browser request to those
 * URLs fails with `ERR_NAME_NOT_RESOLVED` — and the frontend only swaps in
 * a local fallback AFTER the failed request.
 *
 * This script replaces those URLs with the app's established local fallback
 * (`/products/product-vase.jpg`, served from the Vite public dir) so no
 * placeholder URL is ever requested again.
 *
 * Run:  npx tsx scripts/fix-broken-images.ts
 */
import { prisma } from '../src/db'

const PLACEHOLDER_HOST = 'synthetic.example'
const FALLBACK_URL = '/products/product-vase.jpg'

async function main() {
  const before = await prisma.productImage.count({
    where: { url: { contains: PLACEHOLDER_HOST } },
  })
  console.log(`Broken placeholder images before: ${before}`)

  if (before === 0) {
    console.log('Nothing to fix.')
    return
  }

  const result = await prisma.productImage.updateMany({
    where: { url: { contains: PLACEHOLDER_HOST } },
    data: { url: FALLBACK_URL },
  })
  console.log(`Replaced ${result.count} image URLs with "${FALLBACK_URL}"`)

  const after = await prisma.productImage.count({
    where: { url: { contains: PLACEHOLDER_HOST } },
  })
  console.log(`Broken placeholder images after: ${after}`)
}

main()
  .catch((e) => {
    console.error('Fix failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
