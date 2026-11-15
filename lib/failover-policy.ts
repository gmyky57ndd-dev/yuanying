export type FailoverClass = { retryable: boolean; status: number | null };

/** ADR-006 failure table: 5xx/429/network retryable; other 4xx is config. */
export function classifyModelError(error: unknown): FailoverClass {
  const any = error as any;
  const s = any?.statusCode ?? any?.status ?? any?.cause?.statusCode;
  const status = typeof s === 'number' ? s : null;
  if (status === 429) return { retryable: true, status };
  if (status && status >= 500) return { retryable: true, status };
  if (status && status >= 400) return { retryable: false, status };
  const msg = error instanceof Error ? error.message : String(error);
  const retryable = /timeout|abort|network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|connect|bad port|socket/i.test(
    msg
  );
  return { retryable, status };
}
