import webpush from 'web-push';
import { supabase } from '@/lib/db';

/**
 * ES-065: server-side Web Push. The VAPID private key never leaves the server;
 * the public key is exposed to the browser only for `pushManager.subscribe`.
 */
function withVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || 'mailto:owner@yuanying.local';
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

export type PushPayload = { title: string; body: string; url?: string };

export async function saveSubscription(input: {
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      device_id: input.device_id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      device: input.device ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw new Error(error.message);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

/**
 * Send to the devices that are active right now (device_presence within 5 min).
 * If no device is active, fall back to every subscription so the summary still
 * reaches the owner.
 */
export async function pushToActiveDevices(
  payload: PushPayload
): Promise<{ sent: number; failed: number; pruned: number; scoped_to_active: boolean }> {
  const wp = withVapid();
  if (!wp) return { sent: 0, failed: 0, pruned: 0, scoped_to_active: false };

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: presence } = await supabase
    .from('device_presence')
    .select('device_id')
    .gte('last_seen', since);
  const active = new Set((presence ?? []).map((p: any) => p.device_id));

  const { data: subs } = await supabase.from('push_subscriptions').select('*');
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (const sub of (subs ?? []) as any[]) {
    if (active.size > 0 && !active.has(sub.device_id)) continue;
    try {
      await wp.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent += 1;
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id);
    } catch (e: any) {
      failed += 1;
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        pruned += 1;
      }
    }
  }

  return { sent, failed, pruned, scoped_to_active: active.size > 0 };
}
