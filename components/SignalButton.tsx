'use client';

interface Props {
  name: 'wake' | 'sleep' | 'water';
  logged: boolean;
  onClick: () => void;
  count?: number;
}

export function SignalButton({ name, logged, onClick, count }: Props) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
        logged
          ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-800'
          : 'bg-stone-800 text-stone-300 border border-stone-700 active:bg-stone-700'
      }`}
    >
      {count && count > 0 ? `${name} ×${count}` : name}
    </button>
  );
}
