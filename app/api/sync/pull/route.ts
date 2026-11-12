import { NextRequest, NextResponse } from 'next/server';
import { pullAll } from '@/lib/sync-pull';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await pullAll();
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
