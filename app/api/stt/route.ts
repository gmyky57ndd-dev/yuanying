import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * ES-068: server-side speech-to-text (Whisper). The browser records audio and
 * posts it here; the key never reaches the client. When no key is configured the
 * route reports `available: false` and the client falls back to Web Speech.
 */
export async function GET() {
  return NextResponse.json({
    available: !!process.env.OPENAI_API_KEY,
    provider: process.env.OPENAI_API_KEY ? 'whisper-1' : null,
  });
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: 'stt_unavailable',
        fallback: 'web_speech',
        message: 'OPENAI_API_KEY is not configured on the server.',
      },
      { status: 501 }
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get('audio');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'audio file required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty audio' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'audio too large (max 20MB)' }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append('file', file, file.name || 'audio.webm');
  upstream.append('model', 'whisper-1');
  upstream.append('response_format', 'json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return NextResponse.json(
        {
          error: 'stt_failed',
          status: res.status,
          message: body?.error?.message ?? 'transcription failed',
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      text: String(body.text ?? '').trim(),
      provider: 'whisper-1',
    });
  } catch (e) {
    const aborted = e instanceof Error && /abort/i.test(e.message);
    return NextResponse.json(
      {
        error: aborted ? 'stt_timeout' : 'stt_failed',
        message: e instanceof Error ? e.message : 'transcription failed',
      },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
