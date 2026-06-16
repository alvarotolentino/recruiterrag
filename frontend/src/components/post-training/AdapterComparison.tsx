import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { compareModels, listCandidates, listPositions, type ComparisonSide } from '../../api/client';
import { ScoreSpider } from '../candidates/ScoreSpider';
import { LoadingSpinner } from '../shared/LoadingSpinner';

function ComparisonColumn({ title, side }: { title: string; side: ComparisonSide }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {!side.ok ? (
        <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 space-y-1">
          {side.backend === 'llamacpp' ? (
            <>
              <p>Custom AI not reachable. Start with:</p>
              <code className="block text-xs bg-yellow-100 px-2 py-1 rounded">
                docker compose --profile finetuned up -d llamacpp
              </code>
              {side.error && (
                <p className="text-xs text-red-600 mt-1">Error: {side.error}</p>
              )}
            </>
          ) : (
            <p>Standard AI scoring failed: {side.error}</p>
          )}
        </div>
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold text-brand-700">{side.fit_score?.toFixed(1)}/10</p>
          <ScoreSpider scores={side.scores ?? []} name={title} />
          <ul className="mt-2 space-y-1.5">
            {(side.scores ?? []).map((s) => (
              <li key={s.dimension} className="text-xs text-slate-600">
                <span className="font-semibold">
                  {s.dimension}: {s.score}/10
                </span>
                {s.justification ? ` — ${s.justification}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Side-by-side scoring: standard AI vs your fine-tuned AI (spec §14.4.3 step 6). */
export function AdapterComparison() {
  const [positionId, setPositionId] = useState('');
  const [candidateId, setCandidateId] = useState('');

  const { data: positions } = useQuery({ queryKey: ['positions', ''], queryFn: () => listPositions() });
  const { data: candidates } = useQuery({ queryKey: ['candidates', {}], queryFn: () => listCandidates() });

  const compareMutation = useMutation({
    mutationFn: () => compareModels(positionId, candidateId),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Compare: Old vs New AI</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick a candidate and a position — both models score them so you can see what your AI learned.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium">Position</span>
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className="mt-1 block w-64 rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Choose a position…</option>
            {(positions ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">Candidate</span>
          <select
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            className="mt-1 block w-64 rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="">Choose a candidate…</option>
            {(candidates ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => compareMutation.mutate()}
          disabled={!positionId || !candidateId || compareMutation.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {compareMutation.isPending ? 'Scoring…' : 'Compare'}
        </button>
      </div>

      {compareMutation.isPending && (
        <LoadingSpinner label="Both models are scoring the candidate — takes up to a minute…" />
      )}

      {compareMutation.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <ComparisonColumn title="Standard AI" side={compareMutation.data.base} />
          <ComparisonColumn title="Your custom AI ✨" side={compareMutation.data.fine_tuned} />
        </div>
      )}
    </div>
  );
}
