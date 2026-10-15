import { NextResponse } from 'next/server';
import { getConfigTimezone } from '@/lib/timezone';
import { generateWeeklyDigest } from '@/lib/digest-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const tz = await getConfigTimezone();
  const result = await generateWeeklyDigest({ timezone: tz });
  return NextResponse.json(result);
}
