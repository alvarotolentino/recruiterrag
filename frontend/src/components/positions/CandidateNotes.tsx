import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { addPipelineNote, deletePipelineNote, rescoreCandidate } from '../../api/client';
import type { PipelineNote } from '../../types';

export interface CandidateNotesProps {
  positionId: string;
  candidateId: string;
  stages: string[];
  currentStage: string | null;
  notes: PipelineNote[];
}

/** Stage-tagged interview/screening notes with a "re-score with notes" action. */
export function CandidateNotes({ positionId, candidateId, stages, currentStage, notes }: CandidateNotesProps) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState(currentStage ?? stages[0] ?? '');
  const [content, setContent] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pipeline', positionId] });

  const addMutation = useMutation({
    mutationFn: () => addPipelineNote(positionId, candidateId, stage, content),
    onSuccess: () => {
      setContent('');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deletePipelineNote(positionId, candidateId, noteId),
    onSuccess: invalidate,
  });

  const rescoreMutation = useMutation({
    mutationFn: () => rescoreCandidate(positionId, candidateId),
    onSuccess: (r) => {
      toast.success(`Re-scored — new fit ${r.fit_score.toFixed(1)}/10`);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const byStage = notes.reduce<Record<string, PipelineNote[]>>((acc, n) => {
    (acc[n.stage] ??= []).push(n);
    return acc;
  }, {});

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interview notes</h4>
        <button
          onClick={() => rescoreMutation.mutate()}
          disabled={rescoreMutation.isPending}
          title="Re-run AI scoring using the resume plus these notes"
          className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {rescoreMutation.isPending ? 'Re-scoring…' : '✨ Re-score with notes'}
        </button>
      </div>

      {notes.length === 0 && (
        <p className="text-xs text-slate-400">No notes yet. Add screening or interview observations below.</p>
      )}
      {Object.entries(byStage).map(([stageName, stageNotes]) => (
        <div key={stageName} className="mb-2">
          <p className="text-[11px] font-semibold text-slate-500">{stageName}</p>
          <ul className="mt-0.5 space-y-1">
            {stageNotes.map((n) => (
              <li key={n.id} className="group flex items-start justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs">
                <span className="text-slate-700">{n.content}</span>
                <button
                  onClick={() => deleteMutation.mutate(n.id)}
                  aria-label="Delete note"
                  className="text-slate-300 hover:text-red-500 group-hover:text-slate-400"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="mt-2 flex flex-col gap-1.5">
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          aria-label="Note stage"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        >
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Add a note for this stage… e.g. 'Strong on system design, hesitant on Raft internals.'"
          aria-label="New note"
          className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
        />
        <button
          onClick={() => addMutation.mutate()}
          disabled={!content.trim() || addMutation.isPending}
          className="self-end rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
        >
          Add note
        </button>
      </div>
    </div>
  );
}
