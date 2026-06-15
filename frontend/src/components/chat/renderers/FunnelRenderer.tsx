import type { ChatEnvelopeData } from '../../../types';

export interface FunnelRendererProps {
  data: ChatEnvelopeData;
}

/** Pipeline stage funnel rendered as proportional horizontal bars. */
export function FunnelRenderer({ data }: FunnelRendererProps) {
  const funnel = data.funnel ?? [];
  if (funnel.length === 0) return null;
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <div className="mt-2 space-y-1.5">
      {funnel.map((f) => (
        <div key={f.stage} className="flex items-center gap-2">
          <span className="w-36 shrink-0 truncate text-xs text-slate-600">{f.stage}</span>
          <div className="h-6 flex-1 rounded bg-slate-100">
            <div
              className="flex h-full items-center rounded bg-brand-500 px-2 text-xs font-medium text-white"
              style={{ width: `${Math.max((f.count / max) * 100, f.count > 0 ? 8 : 0)}%` }}
            >
              {f.count > 0 ? f.count : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
