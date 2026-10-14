export type ReminderName = 'water' | 'standup' | 'vitamin';

export interface UserContext {
  now: Date;
  todaySignals: Array<{ name: string; created_at: string; context?: any }>;
  recentSignals: Array<{ name: string; created_at: string }>;
  config: Record<string, any>;
}

export interface ReminderConfig {
  name: ReminderName;
  shouldFire: (ctx: UserContext) => boolean | Promise<boolean>;
  buildMessage: (ctx: UserContext) => { message: string; voice_text: string };
}
