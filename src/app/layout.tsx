import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Allo Health — Concurrency-Safe Inventory & Checkout Platform',
  description: 'A robust, high-fidelity real-time reservation system with atomic row-level locks and instant UI feedback.',
};

export default function RootLayout({
  children,
  toast,
}: Readonly<{
  children: React.ReactNode;
  toast?: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-[#05070f] text-slate-100">
        
        {/* Modern Header / Navbar */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-[#05070f]/80 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              
              {/* Logo & Platform Name */}
              <div className="flex items-center gap-3">
                <Link href="/" className="flex items-center gap-2 group">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 border border-violet-500/25 group-hover:border-violet-500/50 transition-all duration-300">
                    <span className="text-xl font-bold text-violet-400 font-mono tracking-tighter">a</span>
                  </div>
                  <span className="text-lg font-semibold tracking-wide text-white group-hover:text-violet-400 transition-all duration-300">
                    Allo <span className="text-violet-400 font-light">Health</span>
                  </span>
                </Link>
                <span className="hidden sm:inline-flex items-center rounded-full bg-slate-900 px-2 py-1 text-xs font-medium text-slate-400 ring-1 ring-inset ring-white/10">
                  Fulfillment Engine v2.0
                </span>
              </div>

              {/* Real-time Status Connection Dot */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-full border border-violet-500/10 bg-violet-500/5 px-3 py-1 text-xs font-medium text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.05)]">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                  </span>
                  PostgreSQL Active
                </div>
              </div>

            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-grow">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5 bg-[#030409] py-8 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p>© {new Date().getFullYear()} Allo Health. Built with Next.js App Router, Prisma v7, and Pessimistic Concurrency Controls.</p>
          </div>
        </footer>

      </body>
    </html>
  );
}
