import { generateText } from 'ai';
import { getModel } from '@/lib/llm-router';
import { generateSummary } from '@/lib/summary-generator';

/**
 * ES-075: the evening summary is finished prose, not a draft. Unlike the daily
 * summary rules, it must NOT end by asking "要不要总结/要我存下来吗".
 */
export const EVENING_SUMMARY_RULES = `- 现在是一天的收尾。直接写总结，不要征求许可，不要问「要不要总结」或「要我存下来吗」。
- 先读 notes，notes 是主体；数字（水/步数/站立）只作背景，不列清单。
- 用第一人称「我们/我（元婴）」，语气冷静、有温度、不啰嗦。
- 全是 0 不代表主人没做事：可能没记录、在休息或生病；不要评判。
- 2–4 句人话，最后一句落在这一天的状态或明天可以接续的事，不要用问句结尾。`;

export async function generateEveningText(
  date: string,
  timezone: string
): Promise<string> {
  const summary = await generateSummary({ date, timezone });
  const data = summary.data as any;
  const compact = {
    date,
    timezone,
    notes: data?.notes ?? null,
    conversations: Array.isArray(data?.conversations)
      ? data.conversations.slice(0, 5)
      : null,
    water: data?.water ?? null,
    steps: data?.steps ?? null,
    standup: data?.standup ?? null,
    sleep: data?.sleep ?? null,
  };

  const model = await getModel();
  const { text } = await generateText({
    model,
    system: `你是元婴，正在为 ${date}（${timezone}）写收尾总结。\n${EVENING_SUMMARY_RULES}`,
    prompt: `这一天的记录（JSON）：\n${JSON.stringify(compact)}\n\n直接写收尾总结。`,
    maxTokens: 360,
  });

  return (
    text?.trim() ||
    `${date} 的记录不多，但这一天已经收尾。`
  );
}
