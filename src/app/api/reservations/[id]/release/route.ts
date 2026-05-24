import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch reservation
      const res = await tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });

      if (!res) {
        throw new Error('RESERVATION_NOT_FOUND');
      }

      // If already RELEASED, return success (Idempotent support)
      if (res.status === 'RELEASED') {
        return { reservation: res, alreadyReleased: true };
      }

      // If already CONFIRMED, cannot be released!
      if (res.status === 'CONFIRMED') {
        throw new Error('RESERVATION_ALREADY_CONFIRMED');
      }

      // 2. Atomically release:
      // - Set status to RELEASED
      // - Decrement reservedUnits in stock by quantity
      const updatedRes = await tx.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
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

      if (stock) {
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            reservedUnits: Math.max(0, stock.reservedUnits - res.quantity),
          },
        });
      }

      return { reservation: updatedRes, alreadyReleased: false };
    });

    return NextResponse.json({
      message: result.alreadyReleased
        ? 'Reservation was already released'
        : 'Reservation released successfully',
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
    if (error.message === 'RESERVATION_ALREADY_CONFIRMED') {
      return NextResponse.json({ error: 'Cannot release a confirmed purchase' }, { status: 400 });
    }

    console.error('Error in reservation release POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
