import { prisma } from '../src/db';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'admin@udrcrafts.com';
  const password = 'AdminPassword123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  const existingAdmin = await prisma.user.findUnique({ where: { email } });

  if (existingAdmin) {
    console.log('Admin already exists.');
    return;
  }

  const admin = await prisma.user.create({
    data: {
      firstName: 'System',
      lastName: 'Administrator',
      email,
      phone: '9999999999',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('Admin created successfully!', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
