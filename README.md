# Allo Health — Inventory & Checkout Hold Platform

Welcome to the **Allo Health Real-time Inventory & Order Fulfillment Platform**. This system is built to prevent checkout race conditions by securing temporary 10-minute reservation holds on units. It features direct PostgreSQL-level pessimistic locking to provide a 100% guarantee of data correctness under high concurrency.

## 🚀 Key Features

- **Pessimistic Concurrency Protection**: High-precision race-condition prevention using atomic `SELECT ... FOR UPDATE` row-level locks in PostgreSQL.
- **Vibrant Dark/Glassmorphic UI**: High-fidelity dashboard displaying live product stocks per warehouse and responsive warehouse source selections.
- **Interactive Checkout Flow**: Seamless checkout details screen showing item summaries and a live MM:SS ticker countdown of the reservation window.
- **Double-Layer Expiry Mechanism**: Active background cleanups paired with lazy cleanups on reads to guarantee perfectly accurate stock levels at all times.
- **Idempotency Protection (Bonus)**: Implements client-side `Idempotency-Key` headers on create and confirm endpoints to block duplicate requests without side effects.
- **Automated Concurrency Testing**: Integrated simulation firing 10 simultaneous reservations at a single stock unit to verify lock safety.

---

## 🛠️ Stack & Technologies

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Database Layer**: Prisma v7 ORM
- **Database Engine**: PostgreSQL (Homebrew locally, Neon/Supabase in production)
- **Database Driver**: Native `@prisma/adapter-pg` with `pg` connection pools
- **Styling**: Tailwind CSS v4 & custom glassmorphism filters
- **Icons**: Lucide React
- **Script Executor**: `tsx`

---

## 📦 Getting Started & Running Locally

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed on your system.

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://mithrr@localhost:5432/allo_health"
```
*(Replace `mithrr` with your local Postgres user or use your hosted Supabase/Neon connection string).*

### 3. Setup Dependencies & Initialize
Install all packages and sync the Prisma schema:
```bash
npm install
npx prisma db push
```

### 4. Seed Mock Data
Populate products, warehouses, and inventory levels:
```bash
npx tsx prisma/seed.ts
```

### 5. Run the Dev Server
Launch the Next.js development server:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to view the application!

---

## ⚡ Concurrency & Lock Strategy

### How Concurrency is Guaranteed Correct
When a reservation request (`POST /api/reservations`) is made, the application opens a database transaction and executes a pessimistic row lock query:
```sql
SELECT * FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```
This forces all concurrent checkout threads attempting to read or hold the exact same product-warehouse inventory row to stall at the database layer until the first transaction either commits (creating the reservation hold) or rolls back. 

This prevents the standard double-booking race condition without the overhead of external locking servers (like Redis Redlock), utilizing PostgreSQL's native transaction control.

---

## ⏲️ Expiry Mechanism in Production

To guarantee expired holds are returned to available stock immediately without leakages, we employ a hybrid cleanup approach:
1. **Lazy Cleanup (On Read)**: Any call to `GET /api/products` or `POST /api/reservations` runs `releaseExpiredReservations()` first. It finds and releases all expired holds on-the-fly, ensuring that stock displays and calculations are always 100% accurate at the moment of inspection.
2. **Active Cron / Background Worker**: A dedicated `/api/cron/release-expired` GET/POST endpoint is exposed. In production, this can be triggered periodically (e.g. every minute) via **Vercel Cron** or a background worker (like GitHub Actions or a cron task) to actively release expired pending holds.

---

## 🔒 Idempotency Design (Bonus)

We support the client-side `Idempotency-Key` header:
- **POST `/api/reservations`**: Before running the transaction, the server queries the database for an existing reservation with the supplied key. If found, it returns the existing reservation details instantly. If not, it creates a new one and stores the key.
- **POST `/api/reservations/[id]/confirm`**: If a payment confirmation is retried under a successful status, the server returns the existing confirmed order state without executing double inventory deduction.

---

## 🧪 Running Concurrency Verification

To prove that our locking strategy successfully blocks race conditions, run the integrated concurrency simulation script:
```bash
npx tsx src/scripts/test-concurrency.ts
```

### What it does:
1. Sets a target SKU stock to exactly **1 unit**.
2. Fires **10 simultaneous checkout requests** to reserve that unit at the exact same millisecond.
3. Asserts that:
   - Exactly **1** request successfully reserves the item (`201 Created`).
   - Exactly **9** requests are safely blocked (`409 Conflict`).
   - Final stock displays **1 reserved, 0 available**.

---

## 🤝 Architectural Trade-offs & Future Extensions

1. **Database Locking vs. Redis Locking**: Pessimistic row locking in PostgreSQL is highly robust and avoids running separate Redis instances. However, for massive global scales (millions of requests/sec), locking database rows can increase transaction times. In a future production system, a distributed caching layer (like **Upstash Redis** or **Redlock**) would absorb lock queries before they hit the relational DB.
2. **Cron Frequency**: In high-traffic scenarios, active cron cleanup intervals should be set to 1 minute to release carts rapidly. We mitigated slower crons by adding lazy cleanups, which guarantees correctness on user interaction regardless of cron delays.
