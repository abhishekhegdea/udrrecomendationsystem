import { prisma } from '../src/db';

async function main() {
  const missing = await prisma.product.findUnique({
    where: { id: '06c3b07c-8ab7-46cf-af60-d03773ebd23a' },
    select: { id: true },
  });
  console.log('MISSING_PRODUCT_EXISTS:', !!missing);

  const sample = await prisma.product.findFirst({ select: { id: true, name: true } });
  console.log('SAMPLE_PRODUCT:', JSON.stringify(sample));

  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  console.log('SAMPLE_USER:', JSON.stringify(user));

  const cols: { column_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'UserBehaviour' ORDER BY ordinal_position`
  );
  console.log('USERBEHAVIOUR_COLUMNS:', cols.map((c) => c.column_name).join(','));
}

main().finally(() => prisma.$disconnect());
