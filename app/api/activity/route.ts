import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS = ['android', 'ios', 'desktop'];
const MAX_APPS = 50;

interface AppUsage {
  package: string;
  name: string;
  foreground_min: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, window_start, window_end, apps } = body ?? {};

    if (!PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'invalid platform' }, { status: 400 });
    }
    if (!window_start || !window_end || !Array.isArray(apps)) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
    }

    // 1. Check remote switch
    const { data: cfg } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'activity_collection_enabled')
      .maybeSingle();

    if (cfg?.value === false) {
      return NextResponse.json({ ok: true, inserted: 0, disabled: true });
    }

    // 2. Write raw batch
    const { data: log, error: logErr } = await supabase
      .from('activity_logs')
      .insert({
        platform,
        window_start,
        window_end,
        raw_payload: body,
      })
      .select('id')
      .single();

    if (logErr) {
      console.error('activity_logs insert failed:', logErr);
    }

    // 3. Split each app into a signals row (max 50)
    const limited = (apps as AppUsage[]).slice(0, MAX_APPS);
    const rows = limited.map(a => ({
      name: 'app_usage',
      type: 'duration',
      value: { package: a.package, name: a.name, duration_min: a.foreground_min },
      source: 'usagestats',
      context: { platform, window_start, window_end },
    }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error: sigErr } = await supabase.from('signals').insert(rows);
      if (sigErr) {
        console.error('signals insert failed:', sigErr);
        return NextResponse.json({ error: sigErr.message }, { status: 500 });
      }
      inserted = rows.length;
    }

    // 4. Mark processed
    if (log?.id) {
      await supabase
        .from('activity_logs')
        .update({ processed: true })
        .eq('id', log.id);
    }

    // 5. Return inserted count
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error('activity route error:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
