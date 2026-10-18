const STYLES: Record<string, string> = {
  new: 'border-stone-700 bg-stone-800 text-stone-300',
  inbox: 'border-sky-800 bg-sky-900/50 text-sky-200',
  pushed: 'border-violet-800 bg-violet-900/50 text-violet-200',
  resolved: 'border-emerald-800 bg-emerald-900/50 text-emerald-200',
};

const LABELS: Record<string, string> = {
  new: 'New',
  inbox: 'Inbox',
  pushed: 'Pushed',
  resolved: 'Resolved',
};

/** ES-023: one status badge shared by the notes list and Feedback tab. */
export function FeedbackStatusBadge({
  status,
}: {
  status?: string | null;
}) {
  const key = status && STYLES[status] ? status : 'new';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] leading-none ${STYLES[key]}`}
    >
      {LABELS[key]}
    </span>
  );
}
