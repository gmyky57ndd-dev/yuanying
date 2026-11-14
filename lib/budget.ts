import { supabase } from './db';
import { recordSystemEvent } from './system-events';

export type BudgetStatus = {
  project_id: string;
  month: string;
  token_budget: number;
  cost_budget: number;
  tokens_used: number;
  cost_used: number;
  token_pct: number;
  cost_pct: number;
  warning: boolean;
  blocked: boolean;
};

const warned = new Map<string, number>();
const WARN_TTL_MS = 15 * 60 * 1000;

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getProjectBudget(projectId: string): Promise<BudgetStatus> {
  const month = monthStart();
  const [{ data: project }, { data: rows }] = await Promise.all([
    supabase
      .from('projects')
      .select('token_budget, cost_budget')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('cost_ledger')
      .select('prompt_tokens, completion_tokens, estimated_cost')
      .eq('project_id', projectId)
      .gte('created_at', month.toISOString()),
  ]);

  const tokens = (rows ?? []).reduce(
    (sum, r: any) => sum + num(r.prompt_tokens) + num(r.completion_tokens),
    0
  );
  const cost = (rows ?? []).reduce((sum, r: any) => sum + num(r.estimated_cost), 0);
  const tokenBudget = num(project?.token_budget);
  const costBudget = num(project?.cost_budget);
  const tokenPct = tokenBudget > 0 ? (tokens / tokenBudget) * 100 : 0;
  const costPct = costBudget > 0 ? (cost / costBudget) * 100 : 0;
  return {
    project_id: projectId,
    month: month.toISOString().slice(0, 7),
    token_budget: tokenBudget,
    cost_budget: costBudget,
    tokens_used: tokens,
    cost_used: Number(cost.toFixed(6)),
    token_pct: Number(tokenPct.toFixed(2)),
    cost_pct: Number(costPct.toFixed(2)),
    warning: (tokenBudget > 0 && tokenPct >= 80) || (costBudget > 0 && costPct >= 80),
    blocked:
      (tokenBudget > 0 && tokens >= tokenBudget) ||
      (costBudget > 0 && cost >= costBudget),
  };
}

/** ADR-004: 100% blocks; 80% warns once per project per 15 min. */
export async function enforceBudget(projectId: string): Promise<BudgetStatus> {
  const status = await getProjectBudget(projectId);
  if (status.blocked) return status;
  if (status.warning) {
    const last = warned.get(projectId) ?? 0;
    if (Date.now() - last > WARN_TTL_MS) {
      warned.set(projectId, Date.now());
      await recordSystemEvent({
        route: '/api/chat',
        status: 200,
        meta: {
          kind: 'budget_warning',
          project_id: projectId,
          token_pct: status.token_pct,
          cost_pct: status.cost_pct,
          tokens_used: status.tokens_used,
          cost_used: status.cost_used,
        },
      });
    }
  }
  return status;
}

export async function getModelPrice(modelId: string): Promise<{
  input_per_1m: number;
  output_per_1m: number;
  currency: string;
} | null> {
  const { data } = await supabase
    .from('model_prices')
    .select('input_per_1m, output_per_1m, currency')
    .eq('model_id', modelId)
    .maybeSingle();
  if (!data) return null;
  return {
    input_per_1m: num(data.input_per_1m),
    output_per_1m: num(data.output_per_1m),
    currency: data.currency || 'USD',
  };
}

export async function recordCost(args: {
  projectId: string;
  fenshenId: string | null;
  modelId: string;
  requestId: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<number> {
  const price = await getModelPrice(args.modelId);
  const cost = price
    ? (args.promptTokens / 1_000_000) * price.input_per_1m +
      (args.completionTokens / 1_000_000) * price.output_per_1m
    : 0;
  try {
    await supabase.from('cost_ledger').insert({
      project_id: args.projectId,
      fenshen_id: args.fenshenId,
      model_id: args.modelId,
      request_id: args.requestId,
      prompt_tokens: Math.max(0, Math.round(args.promptTokens)),
      completion_tokens: Math.max(0, Math.round(args.completionTokens)),
      estimated_cost: Number(cost.toFixed(6)),
    });
  } catch (e) {
    console.warn('cost ledger insert failed', e);
  }
  return Number(cost.toFixed(6));
}

export async function setProjectBudget(
  projectId: string,
  args: { token_budget?: number; cost_budget?: number }
): Promise<BudgetStatus> {
  const patch: Record<string, number> = {};
  if (typeof args.token_budget === 'number') {
    if (args.token_budget < 0) throw new Error('token_budget must be >= 0');
    patch.token_budget = Math.floor(args.token_budget);
  }
  if (typeof args.cost_budget === 'number') {
    if (args.cost_budget < 0) throw new Error('cost_budget must be >= 0');
    patch.cost_budget = args.cost_budget;
  }
  if (!Object.keys(patch).length) throw new Error('token_budget or cost_budget required');
  const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  if (error) throw new Error(error.message);
  return getProjectBudget(projectId);
}
