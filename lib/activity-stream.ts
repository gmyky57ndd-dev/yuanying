/**
 * ES-009 §1/§2: build a raw activity stream from a day's signals.
 * - event signals (wake/sleep/water/brief_wake/reminder_acted) → rows
 * - notes → rows (rendered expandable)
 * - steps → only rows where the snapshot value changed (zeros hidden)
 * - app_usage → contiguous sessions ("应用会话"), apps listed on expand
 */

export type RawSignal = {
  id: number;
  name: string;
  value: any;
  context?: Record<string, any>;
  created_at: string;
};

export type StreamApp = { package: string; name: string; minutes: number };

export type StreamEntry =
  | { kind: 'event'; id: string; at: string; name: string }
  | { kind: 'note'; id: string; at: string; text: string }
  | { kind: 'steps'; id: string; at: string; value: number }
  | {
      kind: 'apps';
      id: string;
      start: string;
      end: string;
      minutes: number;
      apps: StreamApp[];
    };

const EVENT_NAMES = new Set([
  'wake',
  'sleep',
  'water',
  'brief_wake',
  'reminder_acted',
]);

// Merge app_usage windows into one session when the gap is under this.
const SESSION_GAP_MS = 30 * 60000;

function tOf(s: RawSignal): number {
  return new Date(s.created_at).getTime();
}

function entryTime(e: StreamEntry): number {
  return new Date(e.kind === 'apps' ? e.start : e.at).getTime();
}

export function buildActivityStream(signals: RawSignal[]): StreamEntry[] {
  const entries: StreamEntry[] = [];

  for (const s of signals) {
    if (EVENT_NAMES.has(s.name)) {
      entries.push({ kind: 'event', id: `e${s.id}`, at: s.created_at, name: s.name });
    } else if (s.name === 'note') {
      entries.push({
        kind: 'note',
        id: `n${s.id}`,
        at: s.created_at,
        text: String(s.value?.text ?? ''),
      });
    }
  }

  // Steps are cumulative-within-day snapshots. Only show a row when the value
  // changed and is > 0; consecutive zeros (empty HealthConnect syncs) are noise.
  const steps = signals
    .filter(s => s.name === 'steps')
    .sort((a, b) => tOf(a) - tOf(b));
  let lastValue = -1;
  for (const s of steps) {
    const v = typeof s.value === 'number' ? s.value : 0;
    if (v > 0 && v !== lastValue) {
      entries.push({ kind: 'steps', id: `s${s.id}`, at: s.created_at, value: v });
      lastValue = v;
    }
  }

  // app_usage rows are one-per-app-per-window; roll up contiguous windows.
  const windows = new Map<
    string,
    { start: number; end: number; apps: StreamApp[] }
  >();
  for (const s of signals) {
    if (s.name !== 'app_usage') continue;
    const ws = s.context?.window_start;
    const we = s.context?.window_end;
    if (!ws || !we) continue;
    const key = `${ws}|${we}`;
    if (!windows.has(key)) {
      windows.set(key, {
        start: new Date(ws).getTime(),
        end: new Date(we).getTime(),
        apps: [],
      });
    }
    const v = s.value ?? {};
    if (v.package) {
      windows.get(key)!.apps.push({
        package: v.package,
        name: v.name ?? v.package,
        minutes: typeof v.duration_min === 'number' ? v.duration_min : 0,
      });
    }
  }

  const sortedWindows = Array.from(windows.values()).sort(
    (a, b) => a.start - b.start
  );
  const sessions: Array<{
    start: number;
    end: number;
    apps: Map<string, StreamApp>;
  }> = [];
  for (const w of sortedWindows) {
    const cur = sessions[sessions.length - 1];
    if (cur && w.start <= cur.end + SESSION_GAP_MS) {
      cur.end = Math.max(cur.end, w.end);
      for (const a of w.apps) {
        const ex = cur.apps.get(a.package);
        if (ex) ex.minutes += a.minutes;
        else cur.apps.set(a.package, { ...a });
      }
    } else {
      const m = new Map<string, StreamApp>();
      for (const a of w.apps) m.set(a.package, { ...a });
      sessions.push({ start: w.start, end: w.end, apps: m });
    }
  }
  sessions.forEach((sess, i) => {
    entries.push({
      kind: 'apps',
      id: `a${i}`,
      start: new Date(sess.start).toISOString(),
      end: new Date(sess.end).toISOString(),
      minutes: Math.max(1, Math.round((sess.end - sess.start) / 60000)),
      apps: Array.from(sess.apps.values()).sort((a, b) => b.minutes - a.minutes),
    });
  });

  return entries.sort((a, b) => entryTime(a) - entryTime(b));
}

/** Human duration for a session: "45m" / "1h" / "1.5h". */
export function formatDuration(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}
