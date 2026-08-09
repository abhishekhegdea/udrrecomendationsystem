const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  const order = await prisma.order.findFirst({ where: { status: 'PENDING' }, include: { items: true } });
  if (!order) return console.log('No pending order');
  console.log('Found order:', order.id);
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({ where: { id: item.productId }, data: { inventory: { increment: item.quantity } } });
      }
      await tx.orderItem.updateMany({ where: { orderId: order.id }, data: { cancelled: true, cancelledAt: new Date(), cancelledBy: 'CUSTOMER' } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    });
    console.log('Success');
  } catch (e) {
    console.error('Error:', e);
  }
}
test().then(()=>process.exit(0));
