import { NextResponse } from 'next/server';
import { getDisplaySummary } from '@/lib/summary-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getDisplaySummary();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('summary today failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}
