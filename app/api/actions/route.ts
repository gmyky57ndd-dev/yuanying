import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get('project_id')?.trim() || null;
  let q = supabase
    .from('workpad_actions')
    .select('id, project_id, description, status, result_ref, github_issue_number, github_issue_url, created_at, updated_at')
    .order('id', { ascending: false })
    .limit(100);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}
