export interface SummaryData {
  wake: { at: string | null };
  sleep: { at: string | null; duration_min: number | null };
  water: { count: number; target: number };
  steps: { value: number; goal: number };
  reminders: {
    water: { shown: number; acted: number };
    standup: { shown: number; acted: number };
    vitamin: { shown: number; acted: number };
  };
  top_apps: Array<{ name: string; minutes: number }>;
  signals_total: number;
  generated_at: string;
}
