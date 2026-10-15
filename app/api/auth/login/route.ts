import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MS, signSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.OWNER_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';

  if (!expected || !secret || password !== expected) {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  const value = await signSession(Date.now() + SESSION_MS, secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MS / 1000,
    path: '/',
  });
  return res;
}
