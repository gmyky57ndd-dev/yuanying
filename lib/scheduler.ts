import { supabase } from './db';
import { getConfigTimezone } from './timezone';
import { nextScheduledAt, validateScheduleInput } from './schedule-time';

const MAX_PENDING = 3;

export type ScheduleResult = {
  success: true;
  data: {
    scheduled_at: string;
    timezone: string;
    message: string;
  };
};

/** ES-046: limited one-shot reminder using the existing reminder poller. */
export async function scheduleMessage(
  time: string,
  action: string
): Promise<ScheduleResult> {
  const value = validateScheduleInput(time, action);
  const tz = await getConfigTimezone();
  const now = new Date();
  const scheduled = nextScheduledAt(time, tz, now);

  const nowIso = now.toISOString();
  const { count } = await supabase
    .from('reminders')
    .select('id', { count: 'exact', head: true })
    .eq('name', 'scheduled_message')
    .is('shown_at', null)
    .gte('scheduled_at', nowIso);

  if ((count ?? 0) >= MAX_PENDING) {
    throw new Error(`too many pending scheduled messages (max ${MAX_PENDING})`);
  }

  const { error } = await supabase.from('reminders').insert({
    name: 'scheduled_message',
    scheduled_at: scheduled.toISOString(),
    context: {
      message: value,
      voice_text: value,
      source: 'scheduler',
    },
  });
  if (error) throw new Error(`scheduling failed: ${error.message}`);

  return {
    success: true,
    data: {
      scheduled_at: scheduled.toISOString(),
      timezone: tz,
      message: value,
    },
  };
}
