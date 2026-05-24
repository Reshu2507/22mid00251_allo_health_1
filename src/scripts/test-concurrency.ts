import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function runConcurrencyTest() {
  console.log('--- STARTING CONCURRENCY RACE CONDITION TEST ---');

  // 1. Pick Sildenafil (SIL-50) and Bengaluru warehouse
  const product = await prisma.product.findUnique({
    where: { sku: 'SIL-50' },
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { name: { contains: 'Bengaluru' } },
  });

  if (!product || !warehouse) {
    console.error('Test setup failed: Seed data not found!');
    process.exit(1);
  }

  console.log(`Target Product: ${product.name} (ID: ${product.id})`);
  console.log(`Target Warehouse: ${warehouse.name} (ID: ${warehouse.id})`);

  // 2. Set the stock of this product at this warehouse to exactly 1 available unit
  console.log('Setting stock level to exactly 1 total unit, 0 reserved...');
  await prisma.stock.update({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
    data: {
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  // Clean up any existing reservations for this product/warehouse to ensure test isolation
  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
    },
  });

  console.log('Stock configured. Triggering 10 simultaneous reservation requests...');

  // 3. Prepare 10 concurrent requests to POST /api/reservations
  // Since the dev server might not be running yet, we can simulate concurrency by hitting the API logic directly
  // or spawning HTTP requests if dev server is running.
  // Actually, let's run the actual HTTP requests to verify the endpoint is fully concurrent-safe in Next.js!
  // To do this, we assume a local server is running, or we can invoke our raw transaction code concurrently using Promise.all!
  // Invoking the actual transaction concurrently inside the script is an excellent way to test the database lock correctness directly,
  // while we can also launch the Next.js dev server and check it. Let's do both or execute the database transactions concurrently!
  // Let's execute 10 concurrent database transaction calls directly to test PostgreSQL row-locking:
  
  const reserveQuantity = 1;
  const requests = Array.from({ length: 10 }).map(async (_, idx) => {
    const transactionId = idx + 1;
    try {
      // Execute the exact same code as our POST /api/reservations route
      const result = await prisma.$transaction(async (tx) => {
        // Execute pessimistic lock
        const stocks = await tx.$queryRaw<any[]>`
          SELECT * FROM "Stock"
          WHERE "productId" = ${product.id} AND "warehouseId" = ${warehouse.id}
          FOR UPDATE
        `;

        const stock = stocks[0];
        const availableUnits = stock.totalUnits - stock.reservedUnits;

        if (availableUnits < reserveQuantity) {
          throw new Error('INSUFFICIENT_STOCK');
        }

        // Increment reservedUnits
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            reservedUnits: {
              increment: reserveQuantity,
            },
          },
        });

        // Create reservation
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const reservation = await tx.reservation.create({
          data: {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: reserveQuantity,
            expiresAt,
            status: 'PENDING',
          },
        });

        return { success: true, reservationId: reservation.id };
      });

      return { transactionId, status: 'SUCCESS', ...result };
    } catch (error: any) {
      return { transactionId, status: 'ERROR', error: error.message };
    }
  });

  const results = await Promise.all(requests);

  // 4. Summarize and assert results
  console.log('\n--- CONCURRENCY RESULTS ---');
  results.forEach((res: any) => {
    if (res.status === 'SUCCESS') {
      console.log(`[Tx #${res.transactionId}] ✅ SUCCESS: Reserved successfully (ID: ${res.reservationId})`);
    } else {
      console.log(`[Tx #${res.transactionId}] ❌ FAILED: ${res.error}`);
    }
  });

  const successes = results.filter(r => r.status === 'SUCCESS');
  const failures = results.filter(r => r.status === 'ERROR');

  console.log('\n--- EVALUATION SUMMARY ---');
  console.log(`Total Requests: 10`);
  console.log(`Successful Holds Created: ${successes.length}`);
  console.log(`Failed Holds (Blocked): ${failures.length}`);

  // Fetch final stock state
  const finalStock = await prisma.stock.findUnique({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  console.log(`Final Database State: Total Units = ${finalStock?.totalUnits}, Reserved Units = ${finalStock?.reservedUnits}`);
  console.log(`Available Units: ${finalStock!.totalUnits - finalStock!.reservedUnits}`);

  if (successes.length === 1 && failures.length === 9 && finalStock?.reservedUnits === 1) {
    console.log('\n⭐⭐⭐ TEST PASSED: CONCURRENCY RACE-CONDITION WAS PERFECTLY PREVENTED! ⭐⭐⭐');
  } else {
    console.log('\n❌ TEST FAILED: Concurrency control anomaly detected.');
  }
}

runConcurrencyTest()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
