import { NextRequest, NextResponse } from 'next/server';
import { releaseExpiredReservations } from '@/lib/reservations';

export async function GET(req: NextRequest) {
  try {
    const releasedCount = await releaseExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Released ${releasedCount} expired reservations successfully.`,
      releasedCount,
    });
  } catch (error) {
    console.error('Error running release cron:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const releasedCount = await releaseExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Released ${releasedCount} expired reservations successfully.`,
      releasedCount,
    });
  } catch (error) {
    console.error('Error running release cron:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
