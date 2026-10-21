'use client';

export type AvatarState = 'idle' | 'thinking' | 'speaking' | 'listening';

type Props = {
  name: string;
  avatarUrl: string | null;
  state: AvatarState;
  listening: boolean;
  ttsEnabled: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMicStart: () => void;
  onMicEnd: () => void;
  onToggleTts: () => void;
};

const STATE_LABEL: Record<AvatarState, string> = {
  idle: '在。',
  thinking: '在想…',
  speaking: '在说…',
  listening: '在听…',
};

export function AvatarStage({
  name,
  avatarUrl,
  state,
  listening,
  ttsEnabled,
  collapsed,
  onToggleCollapse,
  onMicStart,
  onMicEnd,
  onToggleTts,
}: Props) {
  const imageClass =
    state === 'speaking'
      ? 'avatar-speaking'
      : state === 'thinking'
        ? 'avatar-thinking'
        : state === 'listening'
          ? 'avatar-listening'
          : 'breathe';

  return (
    <section
      className={`relative shrink-0 overflow-hidden border-b border-stone-800 bg-gradient-to-b from-stone-900 via-stone-950 to-stone-950 transition-[height] duration-300 ${
        collapsed ? 'h-20' : 'h-[60vh] min-h-[380px]'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(16,185,129,0.12),transparent_60%)]" />

      <div className="absolute right-4 top-4 z-10 flex gap-3 text-xs">
        <a href="/history" className="text-stone-500">
          历史
        </a>
        <a href="/feedback" className="text-stone-500">
          反馈
        </a>
        <a href="/settings" className="text-stone-500">
          设置
        </a>
      </div>

      {collapsed ? (
        <div className="flex h-full items-center gap-3 px-4">
          <a href="/settings" title="设置">
            <img
              src={avatarUrl || '/avatar.png'}
              alt={name}
              className="h-12 w-12 rounded-full object-cover bg-stone-800"
              onError={e => {
                if (e.currentTarget.src.endsWith('/avatar.png')) return;
                e.currentTarget.src = '/avatar.png';
              }}
            />
          </a>
          <div className="min-w-0">
            <div className="text-sm text-stone-200">{name}</div>
            <div className="text-[11px] text-stone-500">
              {STATE_LABEL[state]}
            </div>
          </div>
          <button
            onClick={onMicStart}
            onPointerDown={e => {
              e.preventDefault();
              onMicStart();
            }}
            onPointerUp={onMicEnd}
            onPointerLeave={onMicEnd}
            className={`ml-auto h-10 w-10 rounded-full ${
              listening ? 'bg-red-900 text-red-100' : 'bg-stone-800 text-stone-300'
            }`}
            aria-label="hold to talk"
          >
            ◉
          </button>
          <button
            onClick={onToggleCollapse}
            className="text-[11px] text-stone-500"
            aria-label="expand avatar"
          >
            展开
          </button>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-20">
            <a href="/settings" title="设置" className="relative">
              <div className="absolute -inset-6 rounded-full border border-emerald-900/40" />
              <div className="absolute -inset-12 rounded-full border border-emerald-900/20" />
              <img
                src={avatarUrl || '/avatar.png'}
                alt={name}
                className={`h-48 w-48 rounded-full bg-stone-800 object-cover sm:h-56 sm:w-56 ${imageClass}`}
                onError={e => {
                  if (e.currentTarget.src.endsWith('/avatar.png')) return;
                  e.currentTarget.src = '/avatar.png';
                }}
              />
            </a>
            <div className="mt-4 text-sm tracking-[0.2em] text-stone-300">
              {name}
            </div>
            <div className="mt-1 text-[11px] text-stone-500">
              {STATE_LABEL[state]}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-4">
            <button
              onClick={onToggleTts}
              className={`text-[11px] px-3 py-2 rounded-full border ${
                ttsEnabled
                  ? 'border-emerald-800 text-emerald-300'
                  : 'border-stone-700 text-stone-500'
              }`}
              aria-label="toggle voice"
            >
              {ttsEnabled ? '声' : '静'}
            </button>
            <button
              onPointerDown={e => {
                e.preventDefault();
                onMicStart();
              }}
              onPointerUp={onMicEnd}
              onPointerLeave={onMicEnd}
              className={`h-16 w-16 rounded-full text-2xl ${
                listening
                  ? 'bg-red-900 text-red-100 mic-listening'
                  : 'bg-emerald-800 text-white'
              }`}
              aria-label="hold to talk"
            >
              ◉
            </button>
            <button
              onClick={onToggleCollapse}
              className="text-[11px] px-3 py-2 rounded-full border border-stone-700 text-stone-500"
              aria-label="collapse avatar"
            >
              收起
            </button>
          </div>
        </>
      )}
    </section>
  );
}
