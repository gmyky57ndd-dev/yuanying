import { NextRequest, NextResponse } from 'next/server';
import { buildAuthorizationUrl } from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const settings = new URL('/settings', req.url);

  try {
    const { url, state } = buildAuthorizationUrl(req.nextUrl.origin);
    const res = NextResponse.redirect(url);
    res.cookies.set('gdrive_oauth_state', state, {
      httpOnly: true,
      secure: req.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return res;
  } catch (e) {
    console.error('Drive authorize failed:', e);
    settings.searchParams.set('drive', 'not_configured');
    return NextResponse.redirect(settings);
  }
}
