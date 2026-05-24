'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Clock, 
  MapPin, 
  CreditCard, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Package
} from 'lucide-react';

interface Reservation {
  id: string;
  productId: string;
  productName: string;
  productPrice: number;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
}

export default function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  
  // Timer states
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [isExpired, setIsExpired] = useState<boolean>(false);
  
  // Custom states to show gorgeous status updates
  const [uiStatus, setUiStatus] = useState<'PENDING' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED'>('PENDING');
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    fetchReservation();
  }, [id]);

  const fetchReservation = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reservations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
        setUiStatus(data.status);
        
        // Calculate remaining seconds
        const expiry = new Date(data.expiresAt).getTime();
        const now = new Date().getTime();
        const diff = Math.max(0, Math.floor((expiry - now) / 1000));
        
        setTimeLeft(diff);
        if (diff <= 0 || data.status !== 'PENDING') {
          setIsExpired(true);
          if (data.status === 'PENDING') {
            setUiStatus('EXPIRED');
          }
        } else {
          setIsExpired(false);
        }
      } else {
        setErrorToast('Could not fetch reservation details.');
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Network error, please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Live timer countdown ticker
  useEffect(() => {
    if (timeLeft <= 0 || uiStatus !== 'PENDING') {
      if (timeLeft <= 0 && uiStatus === 'PENDING') {
        setIsExpired(true);
        setUiStatus('EXPIRED');
      }
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          setUiStatus('EXPIRED');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, uiStatus]);

  const handleConfirm = async () => {
    console.log("handleConfirm triggered! isExpired:", isExpired, "uiStatus:", uiStatus);
    if (isExpired || uiStatus !== 'PENDING') {
      console.log("Early return! isExpired is true or uiStatus is not PENDING");
      return;
    }

    setConfirming(true);
    setErrorToast(null);

    // Unique Idempotency Key for Confirm retry (Bonus)
    const idempotencyKey = `idemp-confirm-${id}-${Date.now()}`;

    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.ok) {
        setUiStatus('CONFIRMED');
        if (reservation) {
          setReservation({
            ...reservation,
            status: 'CONFIRMED'
          });
        }
      } else {
        // Handle 410 Gone (Reservation expired) or other errors
        setErrorToast(data.error || 'Failed to confirm purchase');
        if (res.status === 410) {
          setIsExpired(true);
          setUiStatus('EXPIRED');
        }
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Confirmation failed. Check your network and try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (uiStatus !== 'PENDING') return;

    setCancelling(true);
    setErrorToast(null);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: 'POST',
      });

      if (res.ok) {
        setUiStatus('RELEASED');
        if (reservation) {
          setReservation({
            ...reservation,
            status: 'RELEASED'
          });
        }
      } else {
        const data = await res.json();
        setErrorToast(data.error || 'Failed to release hold');
      }
    } catch (err) {
      console.error(err);
      setErrorToast('Failed to cancel hold. Check network and try again.');
    } finally {
      setCancelling(false);
    }
  };

  // Helper to format MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDuration = 10 * 60; // 10 minutes total
  const percentLeft = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100));

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent mx-auto mb-4"></div>
        <p className="text-slate-400">Loading secure checkout tunnel...</p>
      </div>
    );
  }

  if (errorToast && !reservation) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-xl font-bold text-white">Initialization Error</h3>
        <p className="text-slate-400 mt-2">{errorToast}</p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 text-violet-400 hover:text-violet-300 font-semibold transition">
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </Link>
      </div>
    );
  }

  if (!reservation) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      
      {/* Toast Alert Banner */}
      {errorToast && (
        <div className="fixed bottom-5 right-5 z-50 flex max-w-md items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/90 p-4 text-red-200 shadow-2xl backdrop-blur-md">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
          <div className="flex-1 text-sm font-medium">{errorToast}</div>
          <button 
            onClick={() => setErrorToast(null)} 
            className="rounded p-1 hover:bg-white/10 text-red-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* Back link (shown only if hold is pending) */}
      {uiStatus === 'PENDING' && (
        <button 
          onClick={handleCancel}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Cancel hold and go back
        </button>
      )}

      {/* RENDER SUCCESS STATE */}
      {uiStatus === 'CONFIRMED' ? (
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center overflow-hidden relative shadow-[0_0_80px_rgba(139,92,246,0.08)] border-violet-500/10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl -z-10"></div>
          
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/10 border border-violet-500/35 shadow-[0_0_30px_rgba(139,92,246,0.15)] animate-pulse-slow">
            <CheckCircle2 className="h-10 w-10 text-violet-400" />
          </div>

          <h2 className="mt-8 text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
            Order Confirmed!
          </h2>
          <p className="mt-3 text-base text-slate-400 max-w-lg mx-auto">
            Payment successfully processed and your items have been permanently claimed from inventory.
          </p>

          {/* Receipt detail block */}
          <div className="mt-8 max-w-md mx-auto text-left rounded-2xl border border-white/5 bg-[#111827]/40 p-6 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Order ID:</span>
              <span className="font-mono text-xs text-slate-300 font-semibold">{reservation.id}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Item Claimed:</span>
              <span className="text-slate-200 font-semibold">{reservation.productName}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Fulfillment Hub:</span>
              <span className="text-slate-300 font-semibold">{reservation.warehouseName}</span>
            </div>
            <hr className="border-white/5" />
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-white">Amount Paid:</span>
              <span className="text-xl font-bold text-violet-400 font-mono">
                ${(reservation.productPrice * reservation.quantity).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              href="/" 
              className="rounded-xl bg-violet-600 hover:bg-violet-500 text-white px-8 py-3.5 font-bold text-sm shadow-[0_4px_20px_rgba(139,92,246,0.25)] transition duration-200"
            >
              Browse More Products
            </Link>
          </div>
        </div>

      ) : uiStatus === 'RELEASED' ? (
        /* RENDER RELEASED STATE */
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 border border-white/10">
            <XCircle className="h-8 w-8 text-slate-400" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-white">Hold Released Successfully</h2>
          <p className="mt-2 text-slate-400 max-w-md mx-auto">
            The held inventory units have been unlocked and returned to the active stock pool for other shoppers.
          </p>
          <div className="mt-8">
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-6 py-3 font-semibold text-sm text-slate-200 border border-white/5 transition"
            >
              <ArrowLeft className="h-4 w-4" /> Return to Products List
            </Link>
          </div>
        </div>

      ) : uiStatus === 'EXPIRED' ? (
        /* RENDER EXPIRED STATE (410 STATUS) */
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center border-red-500/10 shadow-[0_0_80px_rgba(239,68,68,0.03)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-950/20 border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          
          <span className="mt-4 inline-flex items-center rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400 ring-1 ring-inset ring-red-500/20 uppercase tracking-widest font-mono">
            Error 410: Hold Expired
          </span>

          <h2 className="mt-4 text-2xl font-bold text-white">Your Stock Reservation Has Expired</h2>
          <p className="mt-2 text-slate-400 max-w-md mx-auto">
            We hold checkout units for exactly 10 minutes. Because payment was not completed in this window, the lock was released so others could purchase the item.
          </p>

          {/* Expired Item Card */}
          <div className="mt-8 max-w-sm mx-auto text-left rounded-xl border border-red-500/10 bg-red-950/5 p-4 flex items-center justify-between text-xs text-slate-400">
            <div>
              <span className="font-semibold text-slate-300 block">{reservation.productName}</span>
              <span>SKU: {reservation.productSku} — {reservation.warehouseName}</span>
            </div>
            <span className="font-mono text-red-400/70 font-semibold uppercase">Released</span>
          </div>

          <div className="mt-8">
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-3 text-sm shadow-[0_4px_20px_rgba(139,92,246,0.2)] transition"
            >
              <ArrowLeft className="h-4 w-4" /> Start New Hold
            </Link>
          </div>
        </div>

      ) : (
        /* RENDER ACTIVE CHECKOUT FLOW (PENDING STATE) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Checkout Panel (2 columns) */}
          <div className="md:col-span-2 space-y-6">
            <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-violet-400 uppercase bg-violet-500/5 px-2.5 py-1 rounded-md border border-violet-500/10 w-fit">
                <ShieldCheck className="h-4 w-4 text-violet-400" /> SECURE TRANSACTING TUNNEL
              </div>

              <h2 className="text-2xl font-extrabold text-white mt-4 tracking-tight">
                Review & Checkout
              </h2>

              <hr className="border-white/5 my-5" />

              {/* Product Info Block */}
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                  <Package className="h-6 w-6 text-slate-400" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-bold text-white text-base leading-snug">
                      {reservation.productName}
                    </h3>
                    <span className="font-mono font-semibold text-slate-200">
                      ${reservation.productPrice.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">SKU: {reservation.productSku} • Qty: {reservation.quantity}</p>
                </div>
              </div>

              {/* Warehouse source details */}
              <div className="mt-5 rounded-xl border border-white/5 bg-[#111827]/40 p-4 flex items-center gap-3">
                <MapPin className="h-5 w-5 text-slate-400 shrink-0" />
                <div className="text-xs text-slate-300">
                  <span className="font-semibold block text-slate-200">Fulfillment Center:</span>
                  {reservation.warehouseName} ({reservation.warehouseLocation})
                </div>
              </div>

              {/* Secure Transaction Notification */}
              <div className="mt-6 flex gap-3 text-xs text-slate-400 border-t border-white/5 pt-5">
                <CreditCard className="h-5 w-5 text-violet-400 shrink-0" />
                <div>
                  <span className="font-semibold text-white block">3DS 2.0 / UPI Concurrency Secured</span>
                  Your payment window is locked. During this hold, no other checkout will be permitted to seize these units.
                </div>
              </div>
            </div>

            {/* Actions Block */}
            <div className="flex gap-4">
              <button
                disabled={cancelling || confirming}
                onClick={handleCancel}
                className="flex-1 rounded-xl border border-white/5 bg-[#111827]/60 hover:bg-white/5 py-4 px-4 font-semibold text-sm text-slate-300 hover:text-white transition-all duration-200"
              >
                {cancelling ? 'Releasing hold...' : 'Cancel Hold'}
              </button>
              
              <button
                disabled={confirming || cancelling}
                onClick={handleConfirm}
                className="flex-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white py-4 px-6 font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_24px_rgba(139,92,246,0.2)] hover:shadow-[0_4px_28px_rgba(139,92,246,0.35)] hover:-translate-y-0.5 transition-all duration-300"
              >
                {confirming ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    Capturing Payment...
                  </>
                ) : (
                  <>
                    Confirm Purchase
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sidebar - Ticking Timer Panel (1 column) */}
          <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-6 text-center border-violet-500/10">
              <Clock className="h-8 w-8 text-slate-400 mx-auto mb-3" />
              <span className="text-xs font-semibold text-slate-500 tracking-wider block uppercase">
                Stock Lock Hold Expires In
              </span>
              
              {/* Massive ticking clock */}
              <div className={`text-4xl font-black font-mono mt-3 tracking-widest ${
                timeLeft < 120 ? 'animate-countdown-warn' : 'text-white'
              }`}>
                {formatTime(timeLeft)}
              </div>

              {/* Progress bar container */}
              <div className="w-full bg-white/5 h-1.5 rounded-full mt-5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    timeLeft < 120 ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'bg-violet-600'
                  }`}
                  style={{ width: `${percentLeft}%` }}
                ></div>
              </div>

              {timeLeft < 120 && (
                <div className="mt-4 text-xs font-medium text-red-400 flex items-center gap-1.5 justify-center bg-red-950/20 py-2 rounded-lg border border-red-500/10">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Under 2 minutes left! Complete payment.
                </div>
              )}
            </div>

            {/* Price Calculation Card */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <span className="text-xs font-semibold text-slate-500 tracking-wider block uppercase">
                Order Summary
              </span>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-mono text-slate-300">${(reservation.productPrice * reservation.quantity).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Fulfillment Tax</span>
                <span className="font-mono text-slate-300">$0.00</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Express Delivery</span>
                <span className="font-mono text-violet-400 font-semibold uppercase">Free</span>
              </div>
              <hr className="border-white/5" />
              <div className="flex justify-between items-center font-bold">
                <span className="text-white text-sm">Total Due</span>
                <span className="text-xl text-white font-mono">
                  ${(reservation.productPrice * reservation.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
