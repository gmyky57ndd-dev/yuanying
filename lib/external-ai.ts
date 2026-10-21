import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

/** ES-053 (optional): ask Claude directly when ANTHROPIC_API_KEY is configured. */
export async function askClaude(prompt: string): Promise<{
  success: true;
  data: { reply: string; model: string };
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const value = prompt.trim();
  if (!value) throw new Error('prompt is required');

  const model = createAnthropic({ apiKey })('claude-3-5-sonnet-latest');
  const result = await generateText({
    model,
    prompt: value,
    maxTokens: 800,
  });
  return {
    success: true,
    data: { reply: result.text.trim(), model: 'claude-3-5-sonnet-latest' },
  };
}
