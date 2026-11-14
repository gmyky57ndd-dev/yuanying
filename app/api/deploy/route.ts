import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { recordSystemEvent } from '@/lib/system-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');

  if (action === 'request') {
    const projectId = String(body?.project_id ?? '').trim();
    const version = String(body?.version ?? '').trim().slice(0, 80);
    const plan = String(body?.plan ?? '').trim().slice(0, 4000);
    if (!projectId || !version || !plan) {
      return NextResponse.json({ error: 'project_id, version and plan required' }, { status: 400 });
    }
    const phrase = `DEPLOY ${projectId} ${version}`;
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    const { data, error } = await supabase
      .from('deploy_confirmations')
      .insert({
        project_id: projectId,
        version,
        plan,
        phrase,
        status: 'pending',
        expires_at: expires,
      })
      .select('id, phrase, expires_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await recordSystemEvent({
      route: '/api/deploy',
      status: 200,
      meta: { kind: 'deploy_request', project_id: projectId, version, confirmation_id: data.id },
    });
    return NextResponse.json({ confirmation: data });
  }

  if (action === 'confirm') {
    const id = String(body?.id ?? '').trim();
    const phrase = String(body?.phrase ?? '').trim();
    if (!id || !phrase) return NextResponse.json({ error: 'id and phrase required' }, { status: 400 });
    const { data: row } = await supabase
      .from('deploy_confirmations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'confirmation not found' }, { status: 404 });
    if (row.status !== 'pending') return NextResponse.json({ error: `not pending: ${row.status}` }, { status: 409 });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabase.from('deploy_confirmations').update({ status: 'expired' }).eq('id', id);
      return NextResponse.json({ error: 'confirmation expired; request a new one' }, { status: 410 });
    }
    if (phrase !== row.phrase) {
      await recordSystemEvent({
        route: '/api/deploy',
        status: 403,
        error: 'phrase mismatch',
        meta: { kind: 'deploy_confirm', confirmation_id: id, project_id: row.project_id },
      });
      return NextResponse.json({ error: 'confirmation phrase mismatch' }, { status: 403 });
    }

    // Provider-agnostic; Coolify is one optional adapter (deferred for desktop).
    const webhook = process.env.DEPLOY_WEBHOOK_URL || process.env.COOLIFY_DEPLOY_WEBHOOK;
    if (!webhook) {
      await supabase.from('deploy_confirmations').update({ status: 'missing_webhook' }).eq('id', id);
      return NextResponse.json(
        { error: 'DEPLOY_WEBHOOK_URL is not configured; no deployment was triggered' },
        { status: 400 }
      );
    }

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: row.project_id, version: row.version, confirmation_id: id }),
        signal: AbortSignal.timeout(15000),
      });
      const text = (await res.text()).slice(0, 500);
      const ok = res.ok;
      await supabase
        .from('deploy_confirmations')
        .update({
          status: ok ? 'triggered' : 'failed',
          confirmed_at: new Date().toISOString(),
          result: text,
        })
        .eq('id', id);
      await recordSystemEvent({
        route: '/api/deploy',
        status: ok ? 200 : 500,
        error: ok ? null : text,
        meta: { kind: 'deploy_confirm', confirmation_id: id, project_id: row.project_id, version: row.version },
      });
      return NextResponse.json({ ok, status: ok ? 'triggered' : 'failed', result: text });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'webhook failed';
      await supabase.from('deploy_confirmations').update({ status: 'failed', result: msg }).eq('id', id);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
