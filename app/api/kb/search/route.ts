import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ES-075: local FTS5 search proxy — the index lives on the owner's machine. */
export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!query) {
    return NextResponse.json({ success: false, error: 'q required' }, { status: 400 });
  }
  try {
    const res = await fetch('http://127.0.0.1:8080/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(5000),
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
