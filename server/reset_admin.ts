import { prisma } from './src/db';
import bcrypt from 'bcryptjs';

async function main() {
  const hash = await bcrypt.hash('Admin@123', 10);
  const user = await prisma.user.update({
    where: { email: 'admin@udrcrafts.com' },
    data: { password: hash }
  });
  console.log("Admin password successfully reset to: Admin@123 for " + user.email);
}
main().catch(console.error).finally(() => process.exit(0));
