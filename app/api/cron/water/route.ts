import { NextResponse } from 'next/server';
import { fireDueReminders } from '@/lib/reminder-scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { fired } = await fireDueReminders('water');
  return NextResponse.json({ ok: true, fired });
}
