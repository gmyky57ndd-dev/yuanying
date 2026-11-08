import { NextRequest, NextResponse } from 'next/server';

const LOCAL_RAG_URL = (process.env.LOCAL_RAG_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ES-075: imported conversations are written to the owner's local disk by the
 * local KB service. This route never stores the body in Supabase; if the local
 * service is down it fails loudly (503) instead of falling back to the cloud.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON' }, { status: 400 });
  }
  try {
    const res = await fetch(`${LOCAL_RAG_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          '本地知识库服务未启动（http://localhost:8080）。请运行 python3 scripts/local_rag_server.py。',
      },
      { status: 503 }
    );
  }
}
