'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  MapPin, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  Activity
} from 'lucide-react';

interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  warehouses: WarehouseStock[];
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  
  // Selected warehouse mapped by product ID
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        
        // Initialize default warehouse selection to the first warehouse with stock, or just the first warehouse
        const defaultSelections: Record<string, string> = {};
        data.forEach((p: Product) => {
          if (p.warehouses.length > 0) {
            const firstWithStock = p.warehouses.find(w => w.availableUnits > 0);
            defaultSelections[p.id] = firstWithStock ? firstWithStock.warehouseId : p.warehouses[0].warehouseId;
          }
        });
        setSelectedWarehouse(defaultSelections);
      }
    } catch (error) {
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWarehouseChange = (productId: string, warehouseId: string) => {
    setSelectedWarehouse(prev => ({
      ...prev,
      [productId]: warehouseId
    }));
  };

  const handleReserve = async (product: Product) => {
    const warehouseId = selectedWarehouse[product.id];
    if (!warehouseId) return;

    setReservingId(`${product.id}-${warehouseId}`);
    setErrorToast(null);

    // Generate a unique Idempotency Key (Bonus Requirement)
    const idempotencyKey = `idemp-${product.id}-${warehouseId}-${Date.now()}`;

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          quantity: 1,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Redirect to reservation checkout details
        router.push(`/reservation/${data.reservation.id}`);
      } else {
        // Handle 409 Conflict (Concurrency fail) or other errors
        setErrorToast(data.error || 'Failed to create reservation');
        // Refresh products to show the latest, correct stock
        await fetchProducts();
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Network error, please try again.');
    } finally {
      setReservingId(null);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Toast Error Notification */}
      {errorToast && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/90 p-4 text-red-200 shadow-2xl backdrop-blur-md animate-bounce">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1 text-sm">
            <span className="font-semibold block">Reservation Failed</span>
            {errorToast}
          </div>
          <button 
            onClick={() => setErrorToast(null)} 
            className="rounded p-1 hover:bg-white/10 text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero Section */}
      <div className="text-center sm:text-left mb-12 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Inventory & Fulfillment
          </h1>
          <p className="mt-3 text-lg text-slate-400 max-w-2xl">
            Reserve critical medical stock securely. Powered by a concurrent-safe, high-precision reservation lock mechanism.
          </p>
        </div>
        
        {/* System Overview Dashboard Widgets */}
        <div className="flex gap-4">
          <div className="glass-panel rounded-xl px-5 py-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/25 flex items-center justify-center">
              <Activity className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Platform Lock</div>
              <div className="text-sm font-semibold text-white">Active (10-min)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="mb-8 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search medical products by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/5 bg-[#111827]/60 py-3.5 pl-12 pr-4 text-white placeholder-slate-500 outline-none ring-violet-500/30 transition focus:border-violet-500 focus:ring-4"
          />
        </div>
        <button 
          onClick={fetchProducts}
          className="rounded-xl border border-white/5 bg-[#111827]/40 px-5 py-3 font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition"
        >
          Refresh Stock
        </button>
      </div>

      {/* Product Grid loading / empty states */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="glass-panel h-80 rounded-2xl animate-pulse flex flex-col justify-between p-6">
              <div className="space-y-3">
                <div className="h-6 w-1/3 rounded bg-white/5"></div>
                <div className="h-4 w-2/3 rounded bg-white/5"></div>
              </div>
              <div className="h-12 w-full rounded bg-white/5"></div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass-panel rounded-2xl py-16 text-center">
          <Layers className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-semibold text-white">No products found</h3>
          <p className="text-sm text-slate-500 mt-1">Try tweaking your search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-2">
          {filteredProducts.map((product) => {
            const currentWhId = selectedWarehouse[product.id];
            const activeWhStock = product.warehouses.find(w => w.warehouseId === currentWhId);
            const isOutOfStock = !activeWhStock || activeWhStock.availableUnits <= 0;
            const hasLowStock = activeWhStock && activeWhStock.availableUnits > 0 && activeWhStock.availableUnits <= 3;
            
            return (
              <div 
                key={product.id}
                className="glass-panel rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group"
              >
                {/* Visual Accent Glow on Hover */}
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-violet-500/5 blur-3xl group-hover:bg-violet-500/10 transition-all duration-500"></div>

                <div>
                  {/* Category Header */}
                  <div className="flex justify-between items-start gap-4">
                    <span className="text-xs font-mono font-semibold tracking-wider text-violet-400 uppercase bg-violet-500/5 px-2.5 py-1 rounded-md border border-violet-500/10">
                      SKU: {product.sku}
                    </span>
                    <span className="text-2xl font-bold text-white font-mono">
                      ${product.price.toFixed(2)}
                    </span>
                  </div>

                  {/* Title & Desc */}
                  <h3 className="text-xl font-bold text-white mt-4 tracking-tight group-hover:text-violet-300 transition-colors duration-300">
                    {product.name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                    {product.description}
                  </p>

                  <hr className="border-white/5 my-5" />

                  {/* Warehouse Selector */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-500" /> SELECT WAREHOUSE
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {product.warehouses.map((wh) => (
                        <button
                          key={wh.warehouseId}
                          onClick={() => handleWarehouseChange(product.id, wh.warehouseId)}
                          className={`flex items-center justify-between text-left rounded-xl p-3 border transition-all duration-200 ${
                            currentWhId === wh.warehouseId
                              ? 'border-violet-500/50 bg-violet-500/5 text-white'
                              : 'border-white/5 bg-[#111827]/40 text-slate-400 hover:border-white/10 hover:bg-[#111827]/60'
                          }`}
                        >
                          <div className="truncate">
                            <span className="font-semibold block text-xs truncate">
                              {wh.warehouseName}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
                              {wh.warehouseLocation}
                            </span>
                          </div>
                          
                          <div className="text-right shrink-0">
                            {wh.availableUnits <= 0 ? (
                              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/10">
                                Out of stock
                              </span>
                            ) : (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                wh.availableUnits <= 3 
                                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/10' 
                                  : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/10'
                              }`}>
                                {wh.availableUnits} available
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Stock Summary Status Alert Bar */}
                <div className="mt-6 space-y-4">
                  {activeWhStock && (
                    <div className={`rounded-xl p-3 border text-xs flex items-center justify-between gap-3 ${
                      isOutOfStock
                        ? 'border-red-500/10 bg-red-950/10 text-red-400'
                        : hasLowStock
                        ? 'border-amber-500/10 bg-amber-950/10 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.02)]'
                        : 'border-cyan-500/10 bg-cyan-950/10 text-cyan-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {isOutOfStock ? (
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-medium">
                          {isOutOfStock 
                            ? 'Stock depletion. Please select another warehouse.'
                            : hasLowStock 
                            ? `Extremely low stock! Only ${activeWhStock.availableUnits} units remain.` 
                            : `Healthy inventory. ${activeWhStock.availableUnits} of ${activeWhStock.totalUnits} available.`}
                        </span>
                      </div>
                      
                      {activeWhStock.reservedUnits > 0 && (
                        <span className="font-mono text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 rounded shrink-0">
                          {activeWhStock.reservedUnits} held in carts
                        </span>
                      )}
                    </div>
                  )}

                  {/* Reserve Action Button */}
                  <button
                    disabled={isOutOfStock || reservingId === `${product.id}-${currentWhId}`}
                    onClick={() => handleReserve(product)}
                    className={`w-full rounded-xl py-3.5 px-4 font-semibold text-sm flex items-center justify-center gap-2 border transition-all duration-300 ${
                      isOutOfStock
                        ? 'bg-slate-900 border-white/5 text-slate-600 cursor-not-allowed'
                        : reservingId === `${product.id}-${currentWhId}`
                        ? 'bg-violet-600/30 border-violet-500/30 text-violet-300 cursor-wait'
                        : 'bg-violet-600 hover:bg-violet-500 border-transparent text-white shadow-[0_4px_20px_rgba(139,92,246,0.2)] hover:shadow-[0_4px_24px_rgba(139,92,246,0.35)] hover:-translate-y-0.5 cursor-pointer font-bold'
                    }`}
                  >
                    {reservingId === `${product.id}-${currentWhId}` ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent"></span>
                        Securing Reservation hold...
                      </>
                    ) : isOutOfStock ? (
                      'Warehouse Depleted'
                    ) : (
                      <>
                        Secure 10-Min Reservation Hold
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
