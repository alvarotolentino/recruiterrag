import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getPipelineCandidates,
  getPosition,
  findNewCandidates,
  includeExcludedCandidate,
  moveCandidateStage,
  rescorePipeline,
  subscribeToScoring,
  updatePosition,
  updatePositionStatus,
} from '../api/client';
import { FloatingChat } from '../components/chat/FloatingChat';
import { ScoreSpider } from '../components/candidates/ScoreSpider';
import { StageBoard } from '../components/candidates/StageBoard';
import { CandidateNotes } from '../components/positions/CandidateNotes';
import { DimensionEditor } from '../components/positions/DimensionEditor';
import { EmptyState } from '../components/shared/EmptyState';
import { InfoTooltip } from '../components/shared/InfoTooltip';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { StatusBadge } from '../components/shared/StatusBadge';
import { DEFAULT_DIMENSION_TARGET, type PipelineCandidateRow, type ScoringDimension } from '../types';

/** How many of the position's targets a candidate's scores clear. */
function targetsMet(
  scores: { dimension: string; score: number }[],
  targets: Record<string, number>,
): { met: number; total: number } {
  const names = Object.keys(targets);
  const byName = new Map(scores.map((s) => [s.dimension, s.score]));
  const met = names.filter((n) => (byName.get(n) ?? 0) >= targets[n]).length;
  return { met, total: names.length };
}

function ScoreChip({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-slate-400">—</span>;
  const color =
    score >= 7.5 ? 'bg-green-100 text-green-800' : score >= 5 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>{score.toFixed(1)}</span>;
}

function CandidateRow({
  row,
  stages,
  positionId,
  targets,
  expanded,
  onToggle,
}: {
  row: PipelineCandidateRow;
  stages: string[];
  positionId: string;
  targets: Record<string, number>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const stageMutation = useMutation({
    mutationFn: (stage: string) => moveCandidateStage(positionId, row.candidate_id, stage),
    onSuccess: (_, stage) => {
      toast.success(`${row.full_name} moved to ${stage}`);
      queryClient.invalidateQueries({ queryKey: ['pipeline', positionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const includeMutation = useMutation({
    mutationFn: () => includeExcludedCandidate(positionId, row.candidate_id),
    onSuccess: () => {
      toast.success(`${row.full_name} re-included and scored`);
      queryClient.invalidateQueries({ queryKey: ['pipeline', positionId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { met, total } = targetsMet(row.dimension_scores, targets);
  const allMet = total > 0 && met === total;

  if (row.status === 'excluded') {
    return (
      <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-500">{row.full_name}</p>
            <p className="text-xs text-slate-400">
              {row.current_role ?? '—'}
              {row.discipline ? ` · ${row.discipline}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Filtered out
          </span>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{row.exclusion_reason ?? 'Did not match this role.'}</p>
        <button
          onClick={() => includeMutation.mutate()}
          disabled={includeMutation.isPending}
          className="mt-2 rounded-md border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          {includeMutation.isPending ? 'Including…' : 'Include anyway'}
        </button>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <div>
          <p className="text-sm font-medium">{row.full_name}</p>
          <p className="text-xs text-slate-500">
            {row.current_role ?? '—'}
            {row.seniority ? ` · ${row.seniority}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span
              title={`Meets ${met} of ${total} target scores`}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                allMet ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {allMet ? '✓ ' : ''}
              {met}/{total}
            </span>
          )}
          <ScoreChip score={row.fit_score} />
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{row.current_stage}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 p-3">
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
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Move to stage
            <select
              value={row.current_stage ?? ''}
              onChange={(e) => stageMutation.mutate(e.target.value)}
              disabled={stageMutation.isPending}
              className="ml-2 rounded border border-slate-300 px-2 py-1 text-xs"
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <CandidateNotes
            positionId={positionId}
            candidateId={row.candidate_id}
            stages={stages}
            currentStage={row.current_stage}
            notes={row.notes ?? []}
          />
        </div>
      )}
    </li>
  );
}

export default function PositionDetail() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'fit' | 'name' | 'years'>('fit');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [closeDialog, setCloseDialog] = useState(false);
  const [scoringProgress, setScoringProgress] = useState<string | null>(null);
  const [onlyMeetingTargets, setOnlyMeetingTargets] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showJD, setShowJD] = useState(false);
  const [editDims, setEditDims] = useState<ScoringDimension[] | null>(null);

  const { data: position, isLoading } = useQuery({
    queryKey: ['position', id],
    queryFn: () => getPosition(id),
    enabled: Boolean(id),
  });

  const { data: pipeline } = useQuery({
    queryKey: ['pipeline', id, showExcluded],
    queryFn: () => getPipelineCandidates(id, showExcluded),
    enabled: Boolean(id),
  });

  // Live scoring progress via SSE when a matching job is running
  useEffect(() => {
    if (!position?.scoring_job_id) return;
    const unsubscribe = subscribeToScoring(
      id,
      (event) => {
        if (event.type === 'scored' && event.message) {
          setScoringProgress(event.message);
          queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
        }
        if (event.type === 'excluded') {
          queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
        }
        if (event.type === 'step' && event.message) setScoringProgress(event.message);
      },
      () => {
        setScoringProgress(null);
        queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
      },
    );
    return unsubscribe;
  }, [id, position?.scoring_job_id, queryClient]);

  const boardMoveMutation = useMutation({
    mutationFn: ({ candidateId, stage }: { candidateId: string; stage: string }) =>
      moveCandidateStage(id, candidateId, stage),
    onSuccess: (_, { stage }) => {
      toast.success(`Moved to ${stage}`);
      queryClient.invalidateQueries({ queryKey: ['pipeline', id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updatePositionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['position', id] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      toast.success('Pipeline updated');
    },
  });

  const saveDimsMutation = useMutation({
    mutationFn: (dims: ScoringDimension[]) =>
      updatePosition(id, {
        extracted_schema: { ...position!.extracted_schema, scoring_dimensions: dims },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['position', id] });
      setEditDims(null);
      toast.success('Dimensions saved. Re-score the pipeline to apply new dimensions.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rescorePipelineMutation = useMutation({
    mutationFn: () => rescorePipeline(id),
    onSuccess: () => {
      // Refetch the position so the new scoring job id activates the SSE progress effect.
      queryClient.invalidateQueries({ queryKey: ['position', id] });
      toast.success('Re-scoring all candidates with their notes…');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const findCandidatesMutation = useMutation({
    mutationFn: () => findNewCandidates(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['position', id] });
      toast.success('Searching your talent pool for new matches…');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !position) return <LoadingSpinner label="Loading position…" />;

  const jd = position.extracted_schema;
  const dimensions = jd.scoring_dimensions ?? [];
  const targets: Record<string, number> = Object.fromEntries(
    dimensions.map((d) => [d.name, d.target ?? DEFAULT_DIMENSION_TARGET]),
  );
  const allRows = pipeline?.candidates ?? [];
  const excludedCount = pipeline?.excluded_count ?? 0;
  const eligibleRows = allRows.filter((r) => r.status !== 'excluded');
  const filteredRows = onlyMeetingTargets
    ? eligibleRows.filter((r) => {
        const { met, total } = targetsMet(r.dimension_scores, targets);
        return total > 0 && met === total;
      })
    : allRows.filter((r) => showExcluded || r.status !== 'excluded');
  // Excluded candidates always sink to the bottom; sort the rest by the chosen key.
  const visibleRows = [...filteredRows].sort((a, b) => {
    const aEx = a.status === 'excluded' ? 1 : 0;
    const bEx = b.status === 'excluded' ? 1 : 0;
    if (aEx !== bEx) return aEx - bEx;
    if (sortBy === 'name') return a.full_name.localeCompare(b.full_name);
    if (sortBy === 'years') return (b.years_exp ?? -1) - (a.years_exp ?? -1);
    return (b.fit_score ?? -1) - (a.fit_score ?? -1);
  });

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{position.title}</h1>
          <StatusBadge status={position.status} />
        </div>
        <div className="flex gap-2">
          {position.status === 'open' && (
            <>
              <button
                onClick={() => statusMutation.mutate('paused')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Pause
              </button>
              <button
                onClick={() => setCloseDialog(true)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Close Pipeline
              </button>
            </>
          )}
          {position.status === 'paused' && (
            <button
              onClick={() => statusMutation.mutate('open')}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white hover:bg-brand-700"
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      {scoringProgress && (
        <div className="mb-3 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">
          ⏳ {scoringProgress}
        </div>
      )}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center text-sm font-semibold text-slate-600">
            Job description
            <InfoTooltip text="The original job description and what the AI pulled from it — discipline, required skills, and the filters used to hide candidates who don't fit this role." />
          </h2>
          <button
            onClick={() => setShowJD((v) => !v)}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {showJD ? 'Hide' : 'View'}
          </button>
        </div>
        {showJD && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap gap-2 text-xs">
              {jd.discipline && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                  Discipline: {jd.discipline}
                </span>
              )}
              {position.seniority && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  Seniority: {position.seniority}
                </span>
              )}
              {position.min_years_exp != null && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  Min {position.min_years_exp}y exp
                </span>
              )}
            </div>
            {(jd.required_skills?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Required skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {jd.required_skills!.map((s) => (
                    <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(jd.exclusion_criteria?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">
                  Filters used to hide non-matching candidates
                </p>
                <ul className="space-y-1">
                  {jd.exclusion_criteria!.map((c) => (
                    <li key={c.id} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <span aria-hidden>{c.enabled ? '🚫' : '⚪'}</span>
                      <span>
                        <span className="font-medium">{c.label}</span>
                        {c.description ? ` — ${c.description}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {position.description && (
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-slate-500">Full text</summary>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-600">{position.description}</pre>
              </details>
            )}
          </div>
        )}
      </section>

      {dimensions.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center text-sm font-semibold text-slate-600">
              Scoring dimensions
              <InfoTooltip text="The qualities the AI rates each candidate on (1–10), pulled from the job description. Each shows a target — the minimum score a candidate should reach. Used to flag who clears the bar." />
            </h2>
            {editDims === null ? (
              <button
                onClick={() => setEditDims(dimensions.map((d) => ({ ...d })))}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditDims(null)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveDimsMutation.mutate(editDims)}
                  disabled={saveDimsMutation.isPending || editDims.length === 0}
                  className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-40"
                >
                  {saveDimsMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
          {editDims === null ? (
            <div className="flex flex-wrap gap-2">
              {dimensions.map((d) => (
                <span
                  key={d.name}
                  title={d.description || undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                >
                  {d.name}
                  <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                    ≥{d.target ?? DEFAULT_DIMENSION_TARGET}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <DimensionEditor dimensions={editDims} onChange={setEditDims} />
          )}
        </section>
      )}

      <section className="flex-1">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">
            Candidates ({onlyMeetingTargets ? `${visibleRows.length} of ${eligibleRows.length}` : eligibleRows.length})
          </h2>
          <div className="flex items-center gap-3">
            {position.status === 'open' && (
              <button
                onClick={() => findCandidatesMutation.mutate()}
                disabled={findCandidatesMutation.isPending || Boolean(scoringProgress)}
                title="Search your talent pool for candidates added since this position was created"
                className="rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                🔍 Find new candidates
              </button>
            )}
            {allRows.length > 0 && (
              <button
                onClick={() => rescorePipelineMutation.mutate()}
                disabled={rescorePipelineMutation.isPending || Boolean(scoringProgress)}
                title="Re-run AI scoring for every candidate using their resume and interview notes"
                className="rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                ✨ Re-score pipeline
              </button>
            )}
            {dimensions.length > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyMeetingTargets}
                  onChange={(e) => setOnlyMeetingTargets(e.target.checked)}
                />
                Meets all targets
              </label>
            )}
            {(excludedCount > 0 || showExcluded) && (
              <label
                className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600"
                title="Candidates the AI filtered out as not matching this role. Turn on to review or re-include them."
              >
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(e) => setShowExcluded(e.target.checked)}
                />
                Show {excludedCount} filtered out
              </label>
            )}
            {view === 'list' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                Sort
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'fit' | 'name' | 'years')}
                  className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                  aria-label="Sort candidates"
                >
                  <option value="fit">Best fit</option>
                  <option value="name">Name (A–Z)</option>
                  <option value="years">Experience (high→low)</option>
                </select>
              </label>
            )}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="View mode">
              {(['list', 'board'] as const).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md px-2.5 py-1 text-xs capitalize ${
                    view === mode ? 'bg-white font-medium shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {mode === 'list' ? '☰ List' : '▦ Board'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {eligibleRows.length === 0 && excludedCount > 0 && !showExcluded ? (
          <EmptyState
            icon="🚫"
            title={`All ${excludedCount} candidates were filtered out`}
            message="None matched this role's discipline or hard requirements. Turn on 'Show filtered out' above to review them, or relax the filters in the job description."
          />
        ) : allRows.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No candidates matched yet"
            message="The AI searched your talent pool and found no matches. Try adding more candidates first."
          />
        ) : view === 'board' ? (
          <StageBoard
            stages={position.stages}
            candidates={onlyMeetingTargets ? visibleRows.filter((r) => r.status !== 'excluded') : eligibleRows}
            onMove={(candidateId, stage) => boardMoveMutation.mutate({ candidateId, stage })}
          />
        ) : visibleRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No candidates meet every target yet. Uncheck the filter to see all.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleRows.map((row) => (
              <CandidateRow
                key={row.pipeline_candidate_id}
                row={row}
                stages={position.stages}
                positionId={id}
                targets={targets}
                expanded={expandedIds.has(row.pipeline_candidate_id)}
                onToggle={() =>
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    next.has(row.pipeline_candidate_id)
                      ? next.delete(row.pipeline_candidate_id)
                      : next.add(row.pipeline_candidate_id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Floating chat assistant — toggled by the bubble, history persists server-side */}
      <FloatingChat positionId={id} />

      {closeDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="Close this pipeline?"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Close this pipeline?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose a reason. All data is preserved and viewable in read-only mode.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCloseDialog(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Keep Open
              </button>
              <button
                onClick={() => {
                  statusMutation.mutate('closed_cancelled');
                  setCloseDialog(false);
                }}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Cancelled
              </button>
              <button
                onClick={() => {
                  statusMutation.mutate('closed_filled');
                  setCloseDialog(false);
                }}
                className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Position Filled 🎉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
