import type { ReactNode } from 'react';
import { InfoTooltip } from '../shared/InfoTooltip';

export interface TileStat {
  label: string;
  value: number | string;
  /** New-in-period count, rendered as a small "+N" delta chip. */
  delta?: number;
  hint?: string;
}

export interface MetricTileProps {
  title: string;
  info?: string;
  /** Plain-language window label, e.g. "this week". */
  periodLabel: string;
  /** Headline figures. Omit or pass an empty array to render the chart alone. */
  stats?: TileStat[];
  children?: ReactNode;
}

/** Summary card: a row of headline figures over an embedded chart. */
export function MetricTile({ title, info, periodLabel, stats = [], children }: MetricTileProps) {
  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center text-sm font-semibold text-slate-800">
          {title}
          {info && <InfoTooltip text={info} />}
        </h2>
        <span className="text-[11px] text-slate-400">{periodLabel}</span>
      </header>

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</dt>
              <dd className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</span>
                {s.delta != null && s.delta > 0 && (
                  <span className="text-[11px] font-medium text-emerald-600">+{s.delta}</span>
                )}
              </dd>
              {s.hint && <p className="text-[10px] text-slate-400">{s.hint}</p>}
            </div>
          ))}
        </dl>
      )}

      {children && <div className={stats.length > 0 ? 'mt-4' : ''}>{children}</div>}
    </section>
  );
}
