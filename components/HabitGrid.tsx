'use client';

type HabitName = 'wake' | 'sleep' | 'water' | 'standup' | 'vitamin';

type Props = {
  signals: Array<{ name: string }>;
  onLog: (name: HabitName) => void;
};

const HABITS: Array<{ name: HabitName; label: string }> = [
  { name: 'wake', label: '起床' },
  { name: 'sleep', label: '入睡' },
  { name: 'water', label: '喝水' },
  { name: 'standup', label: '起身' },
  { name: 'vitamin', label: '维生素' },
];

/** ES-026: the five core habits as one compact, low-density grid. */
export function HabitGrid({ signals, onLog }: Props) {
  const count = (name: HabitName) =>
    signals.filter(s => s.name === name).length;

  return (
    <div className="grid grid-cols-5 gap-1.5 px-3 pb-3 shrink-0">
      {HABITS.map(h => {
        const n = count(h.name);
        const done = n > 0;
        const value =
          h.name === 'water'
            ? n > 0
              ? `×${n}`
              : '·'
            : h.name === 'standup'
              ? `${n}/8`
              : h.name === 'vitamin'
                ? done
                  ? '✓'
                  : '--'
                : done
                  ? '✓'
                  : '·';
        return (
          <button
            key={h.name}
            onClick={() => onLog(h.name)}
            className={`flex flex-col items-center rounded-xl border px-1 py-2 transition-colors ${
              done
                ? 'border-emerald-800 bg-emerald-900/40 text-emerald-200'
                : 'border-stone-800 bg-stone-900 text-stone-400 active:bg-stone-800'
            }`}
            aria-label={h.label}
          >
            <span className="text-[11px] leading-none">{h.label}</span>
            <span className="mt-1 text-[10px] leading-none text-stone-500">
              {value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
