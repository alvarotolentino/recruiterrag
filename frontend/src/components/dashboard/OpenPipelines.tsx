import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PipelineSummary } from '../../types';
import { stageColor } from '../../utils/stageColors';
import { StatusBadge } from '../shared/StatusBadge';

type ViewMode = 'board' | 'list';
type SortKey = 'created' | 'stage' | 'candidates';
type SortDir = 'asc' | 'desc';

export interface OpenPipelinesProps {
  pipelines: PipelineSummary[];
}

/** Furthest stage that holds at least one candidate — used for the "stage" sort + chip. */
function furthestStage(p: PipelineSummary): { label: string; index: number } {
  let found = { label: '—', index: -1 };
  p.stages.forEach((s, i) => {
    if (s.count > 0) found = { label: s.stage, index: i };
  });
  return found;
}

function useSortedPipelines(pipelines: PipelineSummary[]) {
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const value = (p: PipelineSummary): number => {
      if (sortKey === 'created') return p.created_at ? Date.parse(p.created_at) : 0;
      if (sortKey === 'candidates') return p.candidate_count;
      return furthestStage(p).index;
    };
    return [...pipelines].sort((a, b) => (value(a) - value(b)) * dir);
  }, [pipelines, sortKey, sortDir]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created' ? 'desc' : 'desc');
    }
  };

  return { sorted, sortKey, sortDir, toggle };
}

function StageFunnel({ p }: { p: PipelineSummary }) {
  const filled = p.stages.filter((s) => s.count > 0);
  if (filled.length === 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      {filled.map((s) => (
        <div key={s.stage} title={`${s.stage}: ${s.count}`} style={{ background: stageColor(s.stage), flex: s.count }} />
      ))}
    </div>
  );
}

function BoardCard({ p }: { p: PipelineSummary }) {
  const filled = p.stages.filter((s) => s.count > 0);
  return (
    <Link
      to={`/positions/${p.position_id}`}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{p.title}</h3>
        <StatusBadge status={p.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">{p.candidate_count} candidates</p>

      {filled.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {filled.map((s) => (
            <span
              key={s.stage}
              title={`${s.stage}: ${s.count}`}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ background: stageColor(s.stage) }}
            >
              {s.stage} {s.count}
            </span>
          ))}
        </div>
      )}

      {filled.length > 0 && (
        <div className="mt-2">
          <StageFunnel p={p} />
        </div>
      )}

      {p.last_activity && (
        <p className="mt-2 text-xs text-slate-400">
          Last activity: {new Date(p.last_activity).toLocaleDateString()}
        </p>
      )}
    </Link>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium ${className ?? ''}`}>
      <button
        type="button"
        onClick={onClick}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        {label}
        <span className="text-[9px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

function PipelineList({ pipelines }: { pipelines: PipelineSummary[] }) {
  const { sorted, sortKey, sortDir, toggle } = useSortedPipelines(pipelines);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Pipeline</th>
            <SortHeader label="Stage" active={sortKey === 'stage'} dir={sortDir} onClick={() => toggle('stage')} />
            <SortHeader
              label="Candidates"
              active={sortKey === 'candidates'}
              dir={sortDir}
              onClick={() => toggle('candidates')}
              className="text-right"
            />
            <SortHeader label="Created" active={sortKey === 'created'} dir={sortDir} onClick={() => toggle('created')} />
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((p) => {
            const stage = furthestStage(p);
            return (
              <tr key={p.position_id} className="transition hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/positions/${p.position_id}`} className="font-medium text-slate-800 hover:text-brand-600">
                    {p.title}
                  </Link>
                  <div className="mt-1 max-w-[180px]">
                    <StageFunnel p={p} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  {stage.index >= 0 ? (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                      style={{ background: stageColor(stage.label) }}
                    >
                      {stage.label}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.candidate_count}</td>
                <td className="px-3 py-2 text-slate-500">
                  {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OpenPipelines({ pipelines }: OpenPipelinesProps) {
  const [view, setView] = useState<ViewMode>('board');

  return (
    <section data-tour="open-pipelines">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Open pipelines</h2>
        <div role="group" aria-label="View mode" className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {(['board', 'list'] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {pipelines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
          No open pipelines yet.
        </p>
      ) : view === 'board' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((p) => (
            <BoardCard key={p.position_id} p={p} />
          ))}
        </div>
      ) : (
        <PipelineList pipelines={pipelines} />
      )}
    </section>
  );
}
