import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { moveCandidateStage } from '../../api/client';
import { ScoreSpider } from '../candidates/ScoreSpider';
import { CandidateNotes } from './CandidateNotes';
import type { PipelineCandidateRow } from '../../types';

export interface CandidatePopupProps {
  row: PipelineCandidateRow;
  stages: string[];
  positionId: string;
  targets: Record<string, number>;
  readOnly?: boolean;
  onClose: () => void;
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const color =
    score >= 7.5 ? 'bg-green-100 text-green-800' : score >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>{score.toFixed(1)}</span>;
}

/** Side-drawer popup with radar scores, stage controls, and stage-tagged notes. */
export function CandidatePopup({ row, stages, positionId, targets, readOnly, onClose }: CandidatePopupProps) {
  const queryClient = useQueryClient();
  const location = useLocation();

  const stageMutation = useMutation({
    mutationFn: (stage: string) => moveCandidateStage(positionId, row.candidate_id, stage),
    onSuccess: (_, stage) => {
      toast.success(`${row.full_name} moved to ${stage}`);
      queryClient.invalidateQueries({ queryKey: ['pipeline', positionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const currentIdx = stages.indexOf(row.current_stage ?? '');
  const prevStage = currentIdx > 0 ? stages[currentIdx - 1] : null;
  const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${row.full_name} details`}
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{row.full_name}</h2>
            <p className="text-sm text-slate-500">
              {row.current_role ?? '—'}
              {row.seniority ? ` · ${row.seniority}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ScoreChip score={row.fit_score} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        </div>

        <Link
          to={`/candidates/${row.candidate_id}`}
          state={{ from: location.pathname }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          View full profile →
        </Link>

        {(row.cross_pipeline_alerts ?? []).length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">
              {(row.cross_pipeline_alerts ?? []).some((a) => a.signal === 'hired')
                ? '🛑 Already hired elsewhere'
                : '⚠️ Has an offer in another pipeline'}
            </p>
            <ul className="mt-1 space-y-1">
              {(row.cross_pipeline_alerts ?? []).map((a) => (
                <li key={a.position_id}>
                  {a.signal === 'hired' ? 'Hired' : 'Received an offer'} in{' '}
                  <Link
                    to={`/positions/${a.position_id}`}
                    state={{ from: location.pathname }}
                    className="font-medium underline hover:text-amber-700"
                  >
                    {a.position_title}
                  </Link>
                  {a.stage ? ` (stage: ${a.stage})` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-amber-800">
              Decide whether to continue this candidate in the current pipeline.
            </p>
          </div>
        )}

        {row.dimension_scores.length > 0 && (
          <div className="mt-3">
            <ScoreSpider scores={row.dimension_scores} name={row.full_name} />
            <ul className="mt-2 space-y-1">
              {row.dimension_scores.map((d) => {
                const target = targets[d.dimension];
                const meets = target == null || d.score >= target;
                return (
                  <li key={d.dimension} className="text-xs text-slate-600">
                    <span aria-hidden>{target == null ? '' : meets ? '✅ ' : '⚠️ '}</span>
                    <span className="font-semibold">
                      {d.dimension}: {d.score}/10
                    </span>
                    {target != null && (
                      <span className={meets ? 'text-green-600' : 'text-amber-600'}>
                        {' '}
                        (target ≥{target})
                      </span>
                    )}
                    {d.justification ? ` — ${d.justification}` : ''}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Stage:</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{row.current_stage}</span>
          {!readOnly && (
            <>
              <button
                disabled={!prevStage || stageMutation.isPending}
                onClick={() => prevStage && stageMutation.mutate(prevStage)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
              >
                {stageMutation.isPending ? '…' : '← Prev'}
              </button>
              <button
                disabled={!nextStage || stageMutation.isPending}
                onClick={() => nextStage && stageMutation.mutate(nextStage)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
              >
                {stageMutation.isPending ? '…' : 'Next →'}
              </button>
            </>
          )}
        </div>

        <CandidateNotes
          positionId={positionId}
          candidateId={row.candidate_id}
          stages={stages}
          currentStage={row.current_stage}
          notes={row.notes ?? []}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
