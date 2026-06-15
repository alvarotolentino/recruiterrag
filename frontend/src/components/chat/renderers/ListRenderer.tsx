import type { ChatEnvelopeData } from '../../../types';

export interface ListRendererProps {
  data: ChatEnvelopeData;
}

export function ListRenderer({ data }: ListRendererProps) {
  const candidates = data.candidates ?? [];
  if (candidates.length === 0) return null;
  return (
    <ol className="mt-2 space-y-2">
      {candidates.map((c, rank) => (
        <li
          key={c.name}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {rank + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{c.name}</p>
              {c.stage && <p className="text-xs text-slate-500">{c.stage}</p>}
            </div>
          </div>
          {typeof c.fit_score === 'number' && (
            <span className="text-sm font-semibold text-brand-700">{c.fit_score.toFixed(1)}/10</span>
          )}
        </li>
      ))}
    </ol>
  );
}
