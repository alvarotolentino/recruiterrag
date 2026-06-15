import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { ingestCandidates, subscribeToIngestion, updateCandidate } from '../../api/client';
import type { IngestEvent } from '../../types';
import { WizardShell } from './WizardShell';

const STEPS = ['Upload files', 'Processing', 'Review profiles', 'Confirm'];
const MAX_SIZE = 25 * 1024 * 1024;

interface FileProgress {
  file: string;
  status: 'pending' | 'working' | 'done' | 'error';
  message: string;
  candidateId?: string;
  profile?: Record<string, unknown>;
  error?: string;
}

/** Map a backend ingestion error to plain language (spec §14.6.3). */
function friendlyError(error: string | undefined): string {
  const e = (error ?? '').toLowerCase();
  if (e.includes('more system memory') || e.includes('out of memory') || e.includes('oom')) {
    return "The AI ran out of memory loading the model. Give Docker more RAM (8 GB+), or switch to the lighter 'qwen3:4b' model — see the README.";
  }
  if (e.includes('timeout') || e.includes('readtimeout')) {
    return 'The AI took too long to read this resume — likely a large 8B model on CPU. Switch to qwen3:4b (see README) or give Docker more CPU/RAM, then try again.';
  }
  if (e.includes('500') || e.includes('connect') || e.includes('refused')) {
    return "The AI isn't ready yet — it may still be starting up or busy. Wait a moment and try again.";
  }
  if (e.includes('no text') || e.includes('extract')) {
    return "We couldn't read any text from this file. Try a different format, or paste the text directly.";
  }
  return `Something went wrong: ${error ?? 'unknown error'}. Try again, or use a different file.`;
}

/** 4-step candidate ingestion wizard with live SSE progress (spec §14.4.2). */
export function CandidateIngestionWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<FileProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt', '.md'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/tiff': ['.tiff'],
    },
    maxSize: MAX_SIZE,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        toast.error(`${rejected.length} file(s) skipped — unsupported type or larger than 25 MB.`);
      }
      setFiles((prev) => [...prev, ...accepted]);
    },
  });

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const handleEvent = (event: IngestEvent) => {
    if (!event.file) return;
    setProgress((prev) =>
      prev.map((p) => {
        if (p.file !== event.file) return p;
        if (event.type === 'file_done') {
          return { ...p, status: 'done', message: 'Done', candidateId: event.candidate_id, profile: event.profile };
        }
        if (event.type === 'file_error') {
          return { ...p, status: 'error', message: 'Failed', error: event.error };
        }
        return { ...p, status: 'working', message: event.message ?? p.message };
      }),
    );
  };

  const startIngestion = async () => {
    setBusy(true);
    try {
      const { job_id } = await ingestCandidates(files);
      setProgress(files.map((f) => ({ file: f.name, status: 'pending', message: 'Waiting…' })));
      setStep(1);
      unsubscribeRef.current = subscribeToIngestion(job_id, handleEvent, () => {
        setBusy(false);
        queryClient.invalidateQueries({ queryKey: ['candidates'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        setStep(2);
      });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : 'Upload failed. Try again.');
    }
  };

  const succeeded = progress.filter((p) => p.status === 'done');
  const failed = progress.filter((p) => p.status === 'error');

  const canGoNext =
    (step === 0 && files.length > 0) || step === 2 || step === 3;

  const handleNext = () => {
    if (step === 0) {
      void startIngestion();
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    navigate('/candidates');
  };

  return (
    <WizardShell
      title="Add Candidates"
      steps={STEPS}
      currentStep={step}
      canGoNext={canGoNext}
      busy={busy && step === 0}
      hideNav={step === 1}
      nextLabel={step === 0 ? 'Upload & Process →' : step === 3 ? 'Done' : 'Next →'}
      onBack={() => setStep(Math.max(0, step - 1))}
      onNext={handleNext}
    >
      {step === 0 && (
        <div>
          <h2 className="font-semibold">Upload files</h2>
          <p className="mt-1 text-sm text-slate-500">PDF, Word, text, or images. Multiple files supported.</p>
          <div
            {...getRootProps()}
            className={`mt-4 cursor-pointer rounded-lg border-2 border-dashed p-10 text-center text-sm ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 text-slate-500'
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-3xl" aria-hidden>📄</p>
            <p className="mt-2">Drop resumes here, or click to browse</p>
          </div>
          {files.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span>{f.name}</span>
                  <span className="flex items-center gap-3 text-xs text-slate-400">
                    {(f.size / 1024).toFixed(0)} KB
                    <button
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-semibold">Processing your files…</h2>
          <p className="mt-1 text-sm text-slate-500">
            The AI is reading each file and pulling out the key details.
          </p>
          <ul className="mt-4 space-y-2">
            {progress.map((p) => (
              <li key={p.file} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="font-medium">{p.file}</span>
                <span
                  className={`text-xs ${
                    p.status === 'done' ? 'text-green-600' : p.status === 'error' ? 'text-red-600' : 'text-slate-500'
                  }`}
                >
                  {p.status === 'done' ? '✅ Done' : p.status === 'error' ? `❌ ${p.error}` : `⏳ ${p.message}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-semibold">Review profiles</h2>
          <p className="mt-1 text-sm text-slate-500">
            {succeeded.length} candidate{succeeded.length === 1 ? '' : 's'} extracted
            {failed.length > 0 ? `, ${failed.length} failed` : ''}.
          </p>
          <div className="mt-4 space-y-3">
            {succeeded.map((p) => {
              const profile = p.profile ?? {};
              const save = async (field: 'full_name' | 'current_role', value: string) => {
                if (!p.candidateId || value === String(profile[field] ?? '')) return;
                try {
                  await updateCandidate(p.candidateId, { [field]: value });
                  toast.success('Profile updated');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Could not save the change.');
                }
              };
              return (
                <div key={p.file} className="rounded-lg border border-slate-200 p-3">
                  <input
                    defaultValue={String(profile.full_name ?? p.file)}
                    onBlur={(e) => void save('full_name', e.target.value)}
                    aria-label="Candidate name"
                    className="w-full rounded border-0 px-1 py-0.5 font-medium focus:bg-slate-50 focus:outline-none"
                  />
                  <div className="flex items-center gap-1 text-sm text-slate-500">
                    <input
                      defaultValue={String(profile.current_role ?? '')}
                      onBlur={(e) => void save('current_role', e.target.value)}
                      placeholder="Current role"
                      aria-label="Current role"
                      className="flex-1 rounded border-0 px-1 py-0.5 focus:bg-slate-50 focus:outline-none"
                    />
                    {profile.seniority_level ? <span>· {String(profile.seniority_level)}</span> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(Array.isArray(profile.tech_stack) ? (profile.tech_stack as string[]) : [])
                      .slice(0, 6)
                      .map((skill) => (
                        <span key={skill} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                          {skill}
                        </span>
                      ))}
                  </div>
                  {p.candidateId && (
                    <button
                      onClick={() => navigate(`/candidates/${p.candidateId}`)}
                      className="mt-2 text-xs font-medium text-brand-600 hover:underline"
                    >
                      Edit full profile →
                    </button>
                  )}
                </div>
              );
            })}
            {failed.map((p) => (
              <div key={p.file} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                <p className="font-medium text-red-700">{p.file}</p>
                <p className="text-red-600">{friendlyError(p.error)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="py-6 text-center">
          <p className="text-4xl" aria-hidden>🎉</p>
          <h2 className="mt-3 text-lg font-semibold">
            {succeeded.length} candidate{succeeded.length === 1 ? '' : 's'} added to your talent pool
          </h2>
          <p className="mt-1 text-sm text-slate-500">They're now available for matching against your positions.</p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => navigate('/positions')}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Add to a Position Now
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
}
