import { NextRequest, NextResponse } from 'next/server';
import { getProjectBudget } from '@/lib/budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim();
  if (!projectId) return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  return NextResponse.json({ cost: await getProjectBudget(projectId) });
}
