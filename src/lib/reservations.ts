import prisma from './prisma';

/**
 * Atomically releases all expired reservations and adjusts the stock reserved units accordingly.
 * Runs in a secure transaction block.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find all PENDING reservations that have expired
  const expired = await prisma.reservation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        lt: now,
      },
    },
  });

  if (expired.length === 0) {
    return 0;
  }

  // Atomically process releases in a transaction
  await prisma.$transaction(async (tx) => {
    for (const res of expired) {
      // 1. Double check the reservation status is still PENDING (safety check inside transaction)
      const freshRes = await tx.reservation.findUnique({
        where: { id: res.id },
      });

      if (!freshRes || freshRes.status !== 'PENDING') {
        continue;
      }

      // 2. Mark reservation as RELEASED
      await tx.reservation.update({
        where: { id: res.id },
        data: { status: 'RELEASED' },
      });

      // 3. Decrement the reservedUnits in the Stock table
      const stock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: res.productId,
            warehouseId: res.warehouseId,
          },
        },
      });

      if (stock) {
        const newReserved = Math.max(0, stock.reservedUnits - res.quantity);
        await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: res.productId,
              warehouseId: res.warehouseId,
            },
          },
          data: {
            reservedUnits: newReserved,
          },
        });
      }
    }
  });

  return expired.length;
}
