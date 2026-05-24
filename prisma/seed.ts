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

async function main() {
  console.log('Cleaning up existing data...');
  // Delete in reverse dependency order
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  console.log('Seeding products...');
  const products = [
    {
      name: 'Sildenafil (Viagra) 50mg',
      description: 'Effective treatment for erectile dysfunction. Take 30-60 minutes before activity.',
      sku: 'SIL-50',
      price: 15.00,
    },
    {
      name: 'Tadalafil (Cialis) 20mg',
      description: 'Long-lasting treatment for erectile dysfunction. Effective for up to 36 hours.',
      sku: 'TAD-20',
      price: 18.50,
    },
    {
      name: 'Finasteride (Propecia) 1mg',
      description: 'Daily oral prescription tablet for male pattern hair loss treatment.',
      sku: 'FIN-1',
      price: 24.99,
    },
    {
      name: 'Minoxidil 5% Topical Solution',
      description: 'Clinically proven hair regrowth treatment. Apply twice daily directly to the scalp.',
      sku: 'MIN-5',
      price: 19.99,
    },
  ];

  const createdProducts = [];
  for (const prod of products) {
    const created = await prisma.product.create({ data: prod });
    createdProducts.push(created);
  }

  console.log('Seeding warehouses...');
  const warehouses = [
    { name: 'Bengaluru Fulfillment Center', location: 'Bengaluru, Karnataka' },
    { name: 'Mumbai Logistics Hub', location: 'Mumbai, Maharashtra' },
    { name: 'Delhi NCR Warehouse', location: 'Gurugram, Haryana' },
  ];

  const createdWarehouses = [];
  for (const wh of warehouses) {
    const created = await prisma.warehouse.create({ data: wh });
    createdWarehouses.push(created);
  }

  console.log('Seeding stock levels...');
  // Stock levels:
  // - Product 0 (Sildenafil): Bengaluru (10), Mumbai (5), Delhi (0)
  // - Product 1 (Tadalafil): Bengaluru (3), Mumbai (12), Delhi (8)
  // - Product 2 (Finasteride): Bengaluru (15), Mumbai (15), Delhi (15)
  // - Product 3 (Minoxidil): Bengaluru (1), Mumbai (0), Delhi (10)
  const stockMap = [
    [10, 5, 0],   // SIL-50
    [3, 12, 8],   // TAD-20
    [15, 15, 15], // FIN-1
    [1, 0, 10],   // MIN-5
  ];

  for (let pIdx = 0; pIdx < createdProducts.length; pIdx++) {
    const product = createdProducts[pIdx];
    for (let wIdx = 0; wIdx < createdWarehouses.length; wIdx++) {
      const warehouse = createdWarehouses[wIdx];
      const quantity = stockMap[pIdx][wIdx];
      
      await prisma.stock.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          totalUnits: quantity,
          reservedUnits: 0,
        },
      });
    }
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
