import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  activateRun,
  deactivateAdapter,
  listDatasets,
  listTrainingRuns,
  searchTrainingContext,
} from '../api/client';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { ProgressBar } from '../components/shared/ProgressBar';
import { StatusBadge } from '../components/shared/StatusBadge';
import { FirstUseHint } from '../components/onboarding/FirstUseHint';
import type { TrainingRun } from '../types';

export default function PostTraining() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<Record<string, unknown>> | null>(null);
  const [confirmRun, setConfirmRun] = useState<TrainingRun | null>(null);

  const { data: datasets } = useQuery({ queryKey: ['training', 'datasets'], queryFn: listDatasets });
  const { data: runs } = useQuery({
    queryKey: ['training', 'runs'],
    queryFn: listTrainingRuns,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === 'running' || r.status === 'queued') ? 5000 : false,
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => activateRun(id),
    onSuccess: () => {
      toast.success('Your custom AI is now active!');
      queryClient.invalidateQueries({ queryKey: ['training'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateAdapter,
    onSuccess: () => {
      toast.success('Back to the standard AI.');
      queryClient.invalidateQueries({ queryKey: ['training'] });
    },
  });

  const runSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setSearchResults(await searchTrainingContext(searchQuery));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    }
  };

  const activeRun = (runs ?? []).find((r) => r.is_active);
  const runningRun = (runs ?? []).find((r) => r.status === 'running');

  return (
    <div className="space-y-6" data-tour="training">
      <FirstUseHint
        id="post-training"
        text="This teaches the AI to match your specific judgment. You'll need at least one closed pipeline first."
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Teach Your AI</h1>
        <Link
          to="/training/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Start Teaching
        </Link>
      </div>

      {activeRun && (
        <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
          <div>
            <p className="text-sm font-semibold text-green-800">✨ Your custom AI is active</p>
            <p className="text-xs text-green-700">
              Trained {activeRun.completed_at ? new Date(activeRun.completed_at).toLocaleDateString() : ''} ·
              method: {activeRun.method.toUpperCase()}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/training/compare"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Compare: Old vs New AI
            </Link>
            <button
              onClick={() => deactivateMutation.mutate()}
              className="rounded-lg border border-green-300 px-3 py-1.5 text-sm text-green-800 hover:bg-green-100"
            >
              Switch back to standard AI
            </button>
          </div>
        </div>
      )}

      {runningRun && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="mb-2 text-sm font-semibold text-orange-800">Training in progress…</p>
          <ProgressBar value={runningRun.progress} label="Learning from your hiring decisions" />
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your hiring decisions</h2>
        {(datasets ?? []).length === 0 ? (
          <EmptyState
            icon="🎓"
            title="Nothing here yet"
            message="Close a pipeline, then start teaching — the AI learns from who you hired and who you passed on."
          >
            <Link
              to="/training/new"
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Start Teaching
            </Link>
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(datasets ?? []).map((ds) => (
              <div key={ds.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-semibold">{ds.name}</h3>
                  <StatusBadge status={ds.status} />
                </div>
                <dl className="mt-2 space-y-0.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <dt>Examples</dt>
                    <dd className="font-medium text-slate-700">{ds.stats.total_examples}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Decision pairs</dt>
                    <dd className="font-medium text-slate-700">{ds.stats.dpo_pairs}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>With reasoning notes</dt>
                    <dd className="font-medium text-slate-700">{ds.stats.with_cot}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Training history</h2>
        {(runs ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">No training runs yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Quality (eval loss)</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 uppercase">{r.method}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">{r.eval_loss?.toFixed(4) ?? '—'}</td>
                    <td className="px-4 py-3">{r.is_active ? '✨' : ''}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'completed' && !r.is_active && (
                        <button
                          onClick={() => setConfirmRun(r)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Search your training notes</h2>
        <div className="flex gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder='e.g. "kubernetes", "leadership gap"…'
            aria-label="Search training context"
            className="w-96 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={runSearch}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Search
          </button>
        </div>
        {searchResults && (
          <div className="mt-3 space-y-2">
            {searchResults.length === 0 && <p className="text-sm text-slate-400">No matches.</p>}
            {searchResults.map((row, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="line-clamp-3 text-slate-600">{String(row.prompt ?? row.reasoning ?? row.notes ?? '')}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmRun !== null}
        title="Activate this custom AI?"
        message="The assistant will switch to your fine-tuned model for scoring and chat. You can switch back anytime."
        confirmLabel="Activate"
        onConfirm={() => {
          if (confirmRun) activateMutation.mutate(confirmRun.id);
          setConfirmRun(null);
        }}
        onCancel={() => setConfirmRun(null)}
      />
    </div>
  );
}
