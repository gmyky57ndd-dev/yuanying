/**
 * ES-070: break the "要我存下来吗？" loop.
 *
 * The summary tone rules ask the model to close with that question. In a
 * conversation it can repeat it every turn, ignoring the owner's next
 * instruction, so the server counts recent occurrences and strips the question
 * once it has already been asked twice.
 */
const SAVE_QUESTION = /(要我把?(这段|这条|今天|昨天)?[^？?\n]{0,20}存(下来|起来|一下)?吗[？?]?)/;

export function hasSaveQuestion(text: string): boolean {
  return SAVE_QUESTION.test(text);
}

export function stripSaveQuestion(text: string): string {
  const lines = text.split('\n');
  const kept = lines.filter(line => !SAVE_QUESTION.test(line));
  const out = kept.join('\n').trim();
  return out || text.trim();
}

/** How many of the last `window` assistant messages ended with the question. */
export function recentSaveQuestionCount(
  history: Array<{ role: string; content: string }>,
  window = 3
): number {
  const assistants = history.filter(h => h.role === 'assistant').slice(-window);
  return assistants.filter(a => hasSaveQuestion(a.content)).length;
}
