import { generateText } from 'ai';
import { getModel } from './llm-router';
import { classifyModelError } from './failover-policy';

const FAILOVER_TIMEOUT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 60_000;
const PROBE_TTL_MS = 60_000;
const DOWN_TTL_MS = 5 * 60_000;

const healthyUntil = new Map<string, number>();
const downUntil = new Map<string, number>();

export type ResolvedModel = {
  model: Awaited<ReturnType<typeof getModel>>;
  modelId: string;
  degraded: boolean;
  fallbackReason: string | null;
};

function isRetryable(error: unknown): boolean {
  return classifyModelError(error).retryable;
}

async function probe(modelId: string | null, model: ResolvedModel['model'], timeoutMs = FAILOVER_TIMEOUT_MS): Promise<void> {
  await generateText({
    model,
    prompt: 'ping',
    maxTokens: 1,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  if (modelId) healthyUntil.set(modelId, Date.now() + PROBE_TTL_MS);
}

/** ADR-006: request-level failover with a 30s first-token probe and 5m down cache. */
export async function resolveModelWithFailover(args: {
  primaryId: string | null | undefined;
  backupId: string | null | undefined;
  globalModelId: string | null | undefined;
}): Promise<ResolvedModel> {
  const primaryId = args.primaryId || null;
  const backupId = args.backupId || null;
  const primaryLabel = primaryId || args.globalModelId || 'primary';

  if (!backupId) {
    return {
      model: await getModel(primaryId ?? undefined),
      modelId: primaryLabel,
      degraded: false,
      fallbackReason: null,
    };
  }

  // Backup exists: use the primary unless a probe/cache says it is down.
  const down = downUntil.get(primaryLabel) ?? 0;
  const healthy = healthyUntil.get(primaryLabel) ?? 0;
  if (down <= Date.now()) {
    if (healthy > Date.now()) {
      return {
        model: await getModel(primaryId ?? undefined),
        modelId: primaryLabel,
        degraded: false,
        fallbackReason: null,
      };
    }
    try {
      const model = await getModel(primaryId ?? undefined);
      await probe(primaryId, model, FAILOVER_TIMEOUT_MS);
      return { model, modelId: primaryLabel, degraded: false, fallbackReason: null };
    } catch (e) {
      if (!isRetryable(e)) throw e;
      downUntil.set(primaryLabel, Date.now() + DOWN_TTL_MS);
      const reason = e instanceof Error ? e.message : 'primary failed';
      const backupModel = await getModel(backupId);
      await probe(backupId, backupModel, BACKUP_TIMEOUT_MS);
      return {
        model: backupModel,
        modelId: backupId,
        degraded: true,
        fallbackReason: reason.slice(0, 300),
      };
    }
  }

  const backupModel = await getModel(backupId);
  await probe(backupId, backupModel, BACKUP_TIMEOUT_MS);
  return {
    model: backupModel,
    modelId: backupId,
    degraded: true,
    fallbackReason: 'primary marked down after retryable failure',
  };
}

/** Called from stream errors so the next request prefers the backup. */
export function markPrimaryDown(modelId: string | null | undefined): void {
  if (!modelId) return;
  downUntil.set(modelId, Date.now() + DOWN_TTL_MS);
  healthyUntil.delete(modelId);
}
