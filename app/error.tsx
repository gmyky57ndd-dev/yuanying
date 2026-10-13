'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="p-4 text-red-400">
      <p>出错了。</p>
      <p className="text-xs text-stone-500 mt-2">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 px-3 py-1 bg-stone-800 rounded"
      >
        重试
      </button>
    </div>
  );
}
