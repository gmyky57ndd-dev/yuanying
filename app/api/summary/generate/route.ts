import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '@/lib/summary-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date : undefined;
    const timezone =
      typeof body?.timezone === 'string' ? body.timezone : undefined;

    const result = await generateSummary({ date, timezone });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('summary generate failed:', err);
    return NextResponse.json(
      { error: err?.message ?? 'internal error' },
      { status: 500 }
    );
  }
}
