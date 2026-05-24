import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { releaseExpiredReservations } from '@/lib/reservations';

export async function GET() {
  try {
    // 1. Lazily release any expired reservations first
    await releaseExpiredReservations();

    // 2. Fetch products along with stock levels per warehouse
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // 3. Format response to make available stock clean for the frontend
    const formattedProducts = products.map((product) => {
      const warehouseStock = product.stocks.map((stock) => ({
        warehouseId: stock.warehouse.id,
        warehouseName: stock.warehouse.name,
        warehouseLocation: stock.warehouse.location,
        totalUnits: stock.totalUnits,
        reservedUnits: stock.reservedUnits,
        availableUnits: Math.max(0, stock.totalUnits - stock.reservedUnits),
      }));

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        sku: product.sku,
        price: product.price,
        warehouses: warehouseStock,
      };
    });

    return NextResponse.json(formattedProducts);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
