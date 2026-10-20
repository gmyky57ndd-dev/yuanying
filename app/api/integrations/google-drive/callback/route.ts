import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/google-drive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const settings = new URL('/settings', req.url);

  if (req.nextUrl.searchParams.get('error')) {
    settings.searchParams.set('drive', 'denied');
    return NextResponse.redirect(settings);
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get('gdrive_oauth_state')?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    settings.searchParams.set('drive', 'invalid_state');
    return NextResponse.redirect(settings);
  }

  try {
    await exchangeCode(code, req.nextUrl.origin);
    const res = NextResponse.redirect(
      new URL('/settings?drive=connected', req.url)
    );
    res.cookies.delete('gdrive_oauth_state');
    return res;
  } catch (e) {
    console.error('Drive callback failed:', e);
    settings.searchParams.set('drive', 'error');
    return NextResponse.redirect(settings);
  }
}
