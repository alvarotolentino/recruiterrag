export interface StatusBadgeProps {
  status: string;
}

const STYLES: Record<string, string> = {
  open: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  closed_filled: 'bg-blue-100 text-blue-800',
  closed_cancelled: 'bg-slate-200 text-slate-600',
  running: 'bg-orange-100 text-orange-800',
  queued: 'bg-slate-100 text-slate-600',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

const LABELS: Record<string, string> = {
  open: 'Open',
  paused: 'Paused',
  closed_filled: 'Filled',
  closed_cancelled: 'Cancelled',
  running: 'Running',
  queued: 'Queued',
  completed: 'Completed',
  failed: 'Failed',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STYLES[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
