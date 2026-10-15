// Edge-safe auth helpers (ES-004). Runs in middleware (edge) and node routes.

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toHex(new Uint8Array(sig));
}

export async function signSession(exp: number, secret: string): Promise<string> {
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

/** Returns the session expiry (ms) if valid, else null. */
export async function verifySession(
  value: string | undefined,
  secret: string
): Promise<number | null> {
  if (!value || !secret) return null;
  const [expStr, sig] = value.split('.');
  const exp = parseInt(expStr, 10);
  if (!exp || !sig) return null;
  const expected = await hmacHex(secret, expStr);
  if (sig !== expected) return null;
  if (Date.now() > exp) return null;
  return exp;
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return toHex(new Uint8Array(d));
}

export function isBearerValid(authHeader: string | null, token: string): boolean {
  return token.length > 0 && authHeader === `Bearer ${token}`;
}

/** Best-effort write to auth_events via Supabase REST (no SDK; edge-safe). */
export async function logAuthEvent(
  route: string,
  ipHash: string,
  would401: boolean,
  enforced: boolean
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/auth_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        route,
        ip_hash: ipHash,
        would_401: would401,
        enforced,
      }),
    });
  } catch {
    /* logging must never break a request */
  }
}

export const SESSION_COOKIE = 'yy_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
