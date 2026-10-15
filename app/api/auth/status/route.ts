import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isBearerValid, verifySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const bearerOk = isBearerValid(
    req.headers.get('authorization'),
    process.env.API_TOKEN || ''
  );
  const exp = await verifySession(
    req.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET || ''
  );
  return NextResponse.json({ authenticated: !!(bearerOk || exp) });
}
