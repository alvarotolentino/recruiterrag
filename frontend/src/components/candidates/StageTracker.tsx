import type { StageHistoryEntry } from '../../types';

export interface StageTrackerProps {
  history: StageHistoryEntry[];
}

/** Vertical timeline of a candidate's pipeline stage transitions. */
export function StageTracker({ history }: StageTrackerProps) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-400">No stage changes yet.</p>;
  }
  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-5">
      {history.map((h, i) => (
        <li key={`${h.changed_at}-${i}`} className="relative">
          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" />
          <p className="text-sm font-medium">
            {h.from_stage ? `${h.from_stage} → ${h.to_stage}` : `Entered ${h.to_stage}`}
          </p>
          <p className="text-xs text-slate-500">
            {new Date(h.changed_at).toLocaleString()}
            {h.note ? ` — ${h.note}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
