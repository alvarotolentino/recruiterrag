import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import toast from 'react-hot-toast';
import {
  activateRun,
  createDataset,
  deleteExample,
  generatePairs,
  getDataset,
  getTrainingRun,
  listPositions,
  submitTrainingRun,
  updateExample,
} from '../../api/client';
import type { HardwareInfo, TrainingExample, TrainingRun } from '../../types';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ProgressBar } from '../shared/ProgressBar';
import { WizardShell } from './WizardShell';

const STEPS = ['Select your data', 'Review examples', 'Learning method', 'System check', 'Training', 'Complete'];

const TRAINER_URL = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}`.replace(':8000', ':8500');

async function fetchHardware(): Promise<HardwareInfo | null> {
  try {
    const res = await fetch(`${TRAINER_URL}/hardware`);
    if (!res.ok) return null;
    return (await res.json()) as HardwareInfo;
  } catch {
    return null;
  }
}

/** 6-step fine-tuning wizard for non-technical recruiters (spec §14.4.3). */
export function PostTrainingWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [method, setMethod] = useState<'quick' | 'deep'>('quick');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loraRank, setLoraRank] = useState(16);
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState(2e-4);
  const [hardware, setHardware] = useState<HardwareInfo | null | 'loading'>('loading');
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: positions } = useQuery({ queryKey: ['positions', ''], queryFn: () => listPositions() });
  const closedPositions = useMemo(
    () => (positions ?? []).filter((p) => p.status.startsWith('closed')),
    [positions],
  );

  const { data: dataset, refetch: refetchDataset } = useQuery({
    queryKey: ['dataset', datasetId],
    queryFn: () => getDataset(datasetId!),
    enabled: Boolean(datasetId),
  });
  const examples: TrainingExample[] = dataset?.examples ?? [];
  const currentExample = examples[exampleIndex];

  // Poll run status while training (step 4)
  useEffect(() => {
    if (step !== 4 || !run) return;
    const interval = setInterval(async () => {
      try {
        const updated = await getTrainingRun(run.id);
        setRun(updated);
        document.title =
          updated.status === 'running'
            ? `RecruiterRAG — Training ${Math.round(updated.progress * 100)}%`
            : 'RecruiterRAG';
        if (updated.status === 'completed') {
          clearInterval(interval);
          setStep(5);
        }
        if (updated.status === 'failed') {
          clearInterval(interval);
          toast.error(updated.eval_summary ?? 'Training failed.');
        }
      } catch {
        /* transient polling error */
      }
    }, 5000);
    return () => {
      clearInterval(interval);
      document.title = 'RecruiterRAG';
    };
  }, [step, run?.id]);

  const handleNext = async () => {
    if (step === 0) {
      setBusy(true);
      try {
        const ds = await createDataset({
          name: `Training ${new Date().toLocaleDateString()}`,
          method: 'dpo',
        });
        setDatasetId(ds.id);
        for (const pid of selectedPositions) {
          await generatePairs(ds.id, pid);
        }
        await refetchDataset();
        setStep(1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not build your training data.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setHardware('loading');
      setStep(3);
      setHardware(await fetchHardware());
      return;
    }
    if (step === 3) {
      setBusy(true);
      try {
        const submitted = await submitTrainingRun({
          dataset_id: datasetId!,
          method: 'dpo',
          lora_rank: loraRank,
          epochs,
          learning_rate: learningRate,
          notes: method === 'deep' ? 'Deep Learn (DPO + CoT)' : 'Quick Learn (DPO)',
        });
        setRun(submitted);
        setStep(4);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not start training.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 5) {
      navigate('/training');
    }
  };

  const totalPairs = dataset?.stats.dpo_pairs ?? 0;
  const canGoNext =
    (step === 0 && selectedPositions.length > 0) ||
    (step === 1 && totalPairs > 0) ||
    step === 2 ||
    (step === 3 && hardware !== 'loading' && Boolean(hardware?.training_supported)) ||
    step === 5;

  return (
    <WizardShell
      title="Teach your AI assistant your preferences"
      steps={STEPS}
      currentStep={step}
      canGoNext={canGoNext}
      busy={busy}
      hideNav={step === 4}
      nextLabel={step === 3 ? '🚀 Start Training' : step === 5 ? 'Go to Dashboard' : 'Next →'}
      onBack={() => setStep(Math.max(0, step - 1))}
      onNext={handleNext}
    >
      {step === 0 && (
        <div>
          <h2 className="font-semibold">Which hiring decisions should we learn from?</h2>
          <p className="mt-1 text-sm text-slate-500">Pick the closed pipelines to use as training material.</p>
          {closedPositions.length === 0 ? (
            <p className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
              You need at least one closed pipeline first. Finish a hiring round, then come back here.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {closedPositions.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedPositions.includes(p.id)}
                      onChange={(e) =>
                        setSelectedPositions(
                          e.target.checked
                            ? [...selectedPositions, p.id]
                            : selectedPositions.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-slate-500">
                        closed {p.closed_at ? new Date(p.closed_at).toLocaleDateString() : ''} ·{' '}
                        {p.candidate_count ?? 0} candidates
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">⚠ Tip: More closed pipelines = better results.</p>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="font-semibold">We found {totalPairs} examples from your decisions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Want to add your own explanation for any decision? This helps the AI understand your thinking.
          </p>
          {!currentExample ? (
            totalPairs === 0 ? (
              <p className="mt-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700">
                No usable examples found. Pairs need at least one hired/offer candidate and one rejected
                candidate in the same pipeline.
              </p>
            ) : (
              <LoadingSpinner />
            )
          ) : (
            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <p className="text-xs text-slate-400">
                Example {exampleIndex + 1} of {examples.length}
              </p>
              <div className="mt-2 space-y-2 text-sm">
                <p className="rounded bg-green-50 p-2">✅ <span className="font-medium">Preferred:</span> {currentExample.chosen_response?.slice(0, 200)}…</p>
                <p className="rounded bg-red-50 p-2">❌ <span className="font-medium">Passed on:</span> {currentExample.rejected_response?.slice(0, 200)}…</p>
              </div>
              <textarea
                key={currentExample.id}
                defaultValue={currentExample.recruiter_notes ?? ''}
                onBlur={async (e) => {
                  if (e.target.value !== (currentExample.recruiter_notes ?? '')) {
                    await updateExample(datasetId!, currentExample.id, { recruiter_notes: e.target.value });
                  }
                }}
                placeholder="+ Add reasoning note (optional) — why was this the right call?"
                aria-label="Reasoning note"
                rows={2}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={async () => {
                    await deleteExample(datasetId!, currentExample.id);
                    await refetchDataset();
                    setExampleIndex(Math.max(0, exampleIndex - 1));
                  }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove this example
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExampleIndex(Math.max(0, exampleIndex - 1))}
                    disabled={exampleIndex === 0}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ‹ Prev
                  </button>
                  <button
                    onClick={() => setExampleIndex(Math.min(examples.length - 1, exampleIndex + 1))}
                    disabled={exampleIndex >= examples.length - 1}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Next ›
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="font-semibold">How should the AI learn?</h2>
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
              <input type="radio" name="method" checked={method === 'quick'} onChange={() => setMethod('quick')} />
              <div>
                <p className="text-sm font-semibold">Quick Learn <span className="ml-1 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">Recommended for first time</span></p>
                <p className="text-sm text-slate-500">Learn from your accept/reject decisions. Takes ~2 hours.</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50">
              <input type="radio" name="method" checked={method === 'deep'} onChange={() => setMethod('deep')} />
              <div>
                <p className="text-sm font-semibold">Deep Learn</p>
                <p className="text-sm text-slate-500">Also learn the reasoning behind decisions. Takes ~3–4 hours. Better results.</p>
              </div>
            </label>
          </div>
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600"
          >
            {advancedOpen ? '▴' : '▾'} Advanced options (not needed for most users)
          </button>
          {advancedOpen && (
            <div className="mt-2 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <label>
                LoRA rank
                <input type="number" value={loraRank} min={4} max={128}
                  onChange={(e) => setLoraRank(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
              <label>
                Epochs
                <input type="number" value={epochs} min={1} max={10}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
              <label>
                Learning rate
                <input type="number" value={learningRate} step={0.0001}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
              </label>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="font-semibold">Checking your system…</h2>
          {hardware === 'loading' && <LoadingSpinner label="Detecting your hardware…" />}
          {hardware !== 'loading' && hardware?.training_supported && (
            <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm">
              <p>✅ GPU detected: <span className="font-semibold">{hardware.gpu_name}</span>{hardware.vram_gb ? ` (${hardware.vram_gb} GB)` : ''}</p>
              <p className="mt-1">Estimated training time: ~{method === 'deep' ? '3–4 hours' : '2 hours'}</p>
              <p className="mt-1 text-green-700">All good — ready to start!</p>
              <p className="mt-3 text-xs text-slate-500">If you close this window, training will continue in the background.</p>
            </div>
          )}
          {hardware !== 'loading' && !hardware?.training_supported && (
            <div className="mt-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
              <p className="font-semibold">⚠ No compatible GPU found.</p>
              <p className="mt-2">
                {hardware?.message ??
                  'The training service is not running. Start it with: docker compose --profile training up trainer'}
              </p>
              <p className="mt-2">
                You can still use RecruiterRAG fully — the AI just won't be customized to your preferences yet.
              </p>
              <button
                onClick={() => navigate('/')}
                className="mt-3 rounded-lg border border-yellow-300 px-3 py-1.5 text-sm hover:bg-yellow-100"
              >
                Use Standard AI Instead
              </button>
            </div>
          )}
        </div>
      )}

      {step === 4 && run && (
        <div>
          <h2 className="font-semibold">Training your AI assistant…</h2>
          <div className="mt-4">
            <ProgressBar
              value={run.progress}
              label={
                run.status === 'queued'
                  ? 'Getting ready — downloading the AI model if needed…'
                  : 'Currently: Learning from hiring decisions…'
              }
            />
          </div>
          {(run.metrics.loss_curve?.length ?? 0) > 1 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer>
                <LineChart data={run.metrics.loss_curve}>
                  <XAxis dataKey="step" tick={{ fontSize: 10 }} />
                  <YAxis
                    scale="log"
                    domain={['auto', 'auto']}
                    allowDataOverflow
                    tick={{ fontSize: 10 }}
                    width={48}
                    tickFormatter={(v: number) => (v >= 0.01 ? v.toFixed(2) : v.toExponential(0))}
                  />
                  <Tooltip />
                  <Line type="monotone" dataKey="loss" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <p className="font-medium">What's happening:</p>
            <p>
              The AI is studying {totalPairs} examples of your hiring decisions to understand your
              evaluation style.
            </p>
          </div>
          <button
            onClick={() => navigate('/training')}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Run in Background
          </button>
        </div>
      )}

      {step === 5 && run && (
        <div className="py-4 text-center">
          <p className="text-4xl" aria-hidden>🎉</p>
          <h2 className="mt-3 text-lg font-semibold">Your AI assistant has been updated!</h2>
          <p className="mt-2 text-sm text-slate-600">
            It has learned from {totalPairs} of your hiring decisions. It will now score and explain
            candidates more closely to how you think.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={async () => {
                try {
                  await activateRun(run.id);
                  queryClient.invalidateQueries({ queryKey: ['training'] });
                  toast.success('Your custom AI is now active!');
                  navigate('/training/compare');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Activation failed.');
                }
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Activate & Compare: Old vs New AI
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
}
