import { NextRequest, NextResponse } from 'next/server';
import { runFenshenPoll } from '@/lib/fenshen-poll';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const force = new URL(req.url).searchParams.get('force') === '1';
  return NextResponse.json({ ok: true, ...(await runFenshenPoll(force)) });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
