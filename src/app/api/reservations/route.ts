import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { releaseExpiredReservations } from '@/lib/reservations';

export async function POST(req: NextRequest) {
  try {
    // 1. Lazily release any expired reservations first to ensure stock is accurate
    await releaseExpiredReservations();

    const body = await req.json();
    const { productId, warehouseId, quantity = 1 } = body;

    if (!productId || !warehouseId) {
      return NextResponse.json({ error: 'productId and warehouseId are required' }, { status: 400 });
    }

    if (typeof quantity !== 'number' || quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
    }

    // 2. Check for Idempotency-Key (Bonus Requirement)
    const idempotencyKey = req.headers.get('idempotency-key');
    if (idempotencyKey) {
      const existingRes = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { product: true, warehouse: true },
      });

      if (existingRes) {
        console.log(`Idempotent hit for key: ${idempotencyKey}`);
        return NextResponse.json({
          message: 'Reservation retrieved successfully (Idempotent)',
          reservation: {
            id: existingRes.id,
            productId: existingRes.productId,
            productName: existingRes.product.name,
            warehouseId: existingRes.warehouseId,
            warehouseName: existingRes.warehouse.name,
            quantity: existingRes.quantity,
            status: existingRes.status,
            expiresAt: existingRes.expiresAt,
          },
        });
      }
    }

    // 3. Concurrency Protection: Perform a pessimistic lock transaction at the database level
    const result = await prisma.$transaction(async (tx) => {
      // Execute pessimistic lock: SELECT ... FOR UPDATE
      // This blocks other concurrent transactions for the same stock row until this transaction finishes.
      const stocks = await tx.$queryRaw<any[]>`
        SELECT * FROM "Stock"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (stocks.length === 0) {
        throw new Error('STOCK_NOT_FOUND');
      }

      const stock = stocks[0];
      const availableUnits = stock.totalUnits - stock.reservedUnits;

      if (availableUnits < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      // Increment reservedUnits
      const updatedStock = await tx.stock.update({
        where: { id: stock.id },
        data: {
          reservedUnits: {
            increment: quantity,
          },
        },
      });

      // Create reservation: default expiry is 10 minutes from now
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          expiresAt,
          status: 'PENDING',
          idempotencyKey: idempotencyKey || null,
        },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return { reservation, updatedStock };
    });

    return NextResponse.json({
      message: 'Reservation created successfully',
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
    }, { status: 201 });

  } catch (error: any) {
    if (error.message === 'INSUFFICIENT_STOCK') {
      return NextResponse.json({ error: 'Not enough stock available at this warehouse' }, { status: 409 });
    }
    if (error.message === 'STOCK_NOT_FOUND') {
      return NextResponse.json({ error: 'Product or warehouse stock mapping not found' }, { status: 404 });
    }

    // Handle database duplicate key error if concurrent transactions bypass somehow (e.g. idempotency key race condition)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Duplicate reservation under same idempotency key' }, { status: 409 });
    }

    console.error('Error in reservation POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
