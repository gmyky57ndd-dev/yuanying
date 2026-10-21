import { NextRequest, NextResponse } from 'next/server';
import { ingestExternalChat, queryExternalChats } from '@/lib/external-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const source = typeof body?.source === 'string' ? body.source : 'external';
    const content = typeof body?.content === 'string' ? body.content : '';
    const result = await ingestExternalChat(source, content);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'save failed' },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q') ?? '';
    const result = await queryExternalChats(q);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'search failed' },
      { status: 400 }
    );
  }
}
