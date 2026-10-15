import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MS,
  isBearerValid,
  logAuthEvent,
  sha256Hex,
  signSession,
  verifySession,
} from '@/lib/auth';

// ES-004 logging/enforce middleware.
// Logging phase (AUTH_ENFORCE != 'true'): compute would-401, log to
// auth_events, but allow. Enforce phase: reject 401.
export const config = { matcher: ['/api/:path*'] };

const REFRESH_BELOW_MS = SESSION_MS - 5 * 24 * 60 * 60 * 1000; // refresh if < 25d left

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public: cron (CRON_SECRET handled in-route) and auth endpoints.
  if (pathname.startsWith('/api/cron/') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET || '';
  const token = process.env.API_TOKEN || '';

  const bearerOk = isBearerValid(req.headers.get('authorization'), token);
  const exp = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  const cookieOk = exp !== null;

  const authenticated = bearerOk || cookieOk;
  const would401 = !authenticated;
  const enforce = process.env.AUTH_ENFORCE === 'true';

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipHash = await sha256Hex(`${ip}|${process.env.IP_SALT || 'yy'}`);
  await logAuthEvent(pathname, ipHash, would401, enforce && would401);

  if (would401 && enforce) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const res = NextResponse.next();

  // Refresh the 30-day session cookie as it nears expiry (refreshed on use).
  if (cookieOk && secret && exp !== null && exp - Date.now() < REFRESH_BELOW_MS) {
    const val = await signSession(Date.now() + SESSION_MS, secret);
    res.cookies.set(SESSION_COOKIE, val, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: SESSION_MS / 1000,
      path: '/',
    });
  }

  return res;
}
