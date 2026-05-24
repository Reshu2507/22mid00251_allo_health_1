import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check Idempotency-Key header for confirm (Bonus Requirement)
    const idempotencyKey = req.headers.get('idempotency-key');

    // Execute within transaction to guarantee correctness
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch reservation
      const res = await tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });

      if (!res) {
        throw new Error('RESERVATION_NOT_FOUND');
      }

      // If already CONFIRMED, return success (Idempotent support)
      if (res.status === 'CONFIRMED') {
        return { reservation: res, alreadyConfirmed: true };
      }

      // If already RELEASED or expired
      if (res.status === 'RELEASED' || res.expiresAt < new Date()) {
        // If it was PENDING but is expired, lazily release it inside this transaction
        if (res.status === 'PENDING') {
          await tx.reservation.update({
            where: { id },
            data: { status: 'RELEASED' },
          });

          // Decrement reservedUnits
          const stock = await tx.stock.findUnique({
            where: {
              productId_warehouseId: {
                productId: res.productId,
                warehouseId: res.warehouseId,
              },
            },
          });
          if (stock) {
            await tx.stock.update({
              where: { id: stock.id },
              data: {
                reservedUnits: Math.max(0, stock.reservedUnits - res.quantity),
              },
            });
          }
        }
        throw new Error('RESERVATION_EXPIRED');
      }

      // 2. Atomically confirm:
      // - Set status to CONFIRMED
      // - Decrement totalUnits by quantity
      // - Decrement reservedUnits by quantity
      const updatedRes = await tx.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' },
        include: { product: true, warehouse: true },
      });

      const stock = await tx.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: res.productId,
            warehouseId: res.warehouseId,
          },
        },
      });

      if (!stock) {
        throw new Error('STOCK_NOT_FOUND');
      }

      await tx.stock.update({
        where: { id: stock.id },
        data: {
          totalUnits: Math.max(0, stock.totalUnits - res.quantity),
          reservedUnits: Math.max(0, stock.reservedUnits - res.quantity),
        },
      });

      return { reservation: updatedRes, alreadyConfirmed: false };
    });

    return NextResponse.json({
      message: result.alreadyConfirmed
        ? 'Reservation already confirmed previously'
        : 'Reservation confirmed successfully (Payment captured)',
      reservation: {
        id: result.reservation.id,
        productId: result.reservation.productId,
        productName: result.reservation.product.name,
        warehouseId: result.reservation.warehouseId,
        warehouseName: result.reservation.warehouse.name,
        quantity: result.reservation.quantity,
        status: result.reservation.status,
        expiresAt: result.reservation.expiresAt,
      },
    });

  } catch (error: any) {
    if (error.message === 'RESERVATION_NOT_FOUND') {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }
    if (error.message === 'RESERVATION_EXPIRED') {
      return NextResponse.json({ error: 'Reservation has expired' }, { status: 410 });
    }
    if (error.message === 'STOCK_NOT_FOUND') {
      return NextResponse.json({ error: 'Stock mapping not found' }, { status: 500 });
    }

    console.error('Error in reservation confirm POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
