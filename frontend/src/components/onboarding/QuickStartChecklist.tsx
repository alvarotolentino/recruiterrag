import { useQuery } from '@tanstack/react-query';
import { getDashboardMetrics, getPipelineSummary } from '../../api/client';
import { ProgressBar } from '../shared/ProgressBar';

interface ChecklistItem {
  label: string;
  done: boolean;
}

/** Sidebar widget tracking 6 milestones, auto-checked from API state (spec §14.5.3). */
export function QuickStartChecklist() {
  const { data: metrics } = useQuery({
    queryKey: ['dashboard', 'metrics', 'month'],
    queryFn: () => getDashboardMetrics('month'),
    staleTime: 60_000,
  });
  const { data: pipelines } = useQuery({
    queryKey: ['dashboard', 'pipelines'],
    queryFn: getPipelineSummary,
    staleTime: 60_000,
  });

  if (!metrics) return null;

  const hasStageMovement = (pipelines ?? []).some((p) =>
    p.stages.some((s, i) => i > 0 && s.count > 0),
  );

  const items: ChecklistItem[] = [
    { label: 'Create your first position', done: metrics.total_positions > 0 },
    { label: 'Add at least 5 candidates', done: metrics.total_candidates >= 5 },
    { label: 'Review the top candidates', done: metrics.candidates.in_play > 0 },
    { label: 'Move a candidate to the next stage', done: hasStageMovement },
    {
      label: 'Use the chat to compare candidates',
      done: localStorage.getItem('recruiterrag.usedChat') === 'true',
    },
    {
      label: 'Close your first pipeline',
      done: (pipelines ?? []).some((p) => p.status.startsWith('closed')),
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  if (doneCount === items.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Your setup checklist</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{item.done ? '✅' : '○'}</span>
            <span className={item.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <ProgressBar value={doneCount / items.length} label={`${doneCount} / ${items.length} complete`} />
      </div>
    </div>
  );
}
