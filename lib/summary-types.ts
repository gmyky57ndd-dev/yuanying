export interface SummaryData {
  wake: { at: string | null };
  sleep: { at: string | null; duration_min: number | null };
  water: { count: number; target: number };
  standup: { count: number; target: number };
  vitamin: { done: boolean; at: string | null };
  steps: { value: number; goal: number };
  apps_used: number;
  reminders: {
    water: { shown: number; acted: number };
    standup: { shown: number; acted: number };
    vitamin: { shown: number; acted: number };
  };
  top_apps: Array<{ name: string; minutes: number }>;
  notes: { count: number; items: Array<{ at: string; text: string }> };
  signals_total: number;
  generated_at: string;
}
