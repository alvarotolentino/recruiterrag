import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { createPosition, extractJD } from '../../api/client';
import { DEFAULT_DIMENSION_TARGET, type JDSchema } from '../../types';
import { InfoTooltip } from '../shared/InfoTooltip';
import { SortableList } from '../shared/SortableList';
import { WizardShell } from './WizardShell';

const STEPS = ['Job Description', 'Review details', 'Scoring dimensions', 'Pipeline stages'];
const DEFAULT_STAGES = ['New', 'Screening', 'Technical Interview', 'Cultural Interview', 'Offer', 'Hired', 'Rejected'];

interface KeyedItem {
  key: string;
  value: string;
}

interface DimItem {
  key: string;
  name: string;
  target: number;
}

/** 4-step position creation wizard (spec §14.4.1) with drag-and-drop ordering. */
export function NewPositionWizard() {
  const navigate = useNavigate();
  const keyCounter = useRef(0);
  const nextKey = (prefix: string) => `${prefix}-${keyCounter.current++}`;

  const [step, setStep] = useState(0);
  const [jdText, setJdText] = useState('');
  const [schema, setSchema] = useState<JDSchema | null>(null);
  const [dims, setDims] = useState<DimItem[]>([]);
  const [stages, setStages] = useState<KeyedItem[]>(
    DEFAULT_STAGES.map((s) => ({ key: nextKey('stage'), value: s })),
  );
  const [newStage, setNewStage] = useState('');
  const [busy, setBusy] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/plain': ['.txt', '.md'] },
    maxFiles: 1,
    onDrop: async (files) => {
      const text = await files[0]?.text();
      if (text) setJdText(text);
    },
  });

  const handleNext = async () => {
    if (step === 0) {
      setBusy(true);
      try {
        const extracted = await extractJD(jdText);
        setSchema(extracted);
        setDims(
          extracted.scoring_dimensions.map((d) => ({
            key: nextKey('dim'),
            name: d.name,
            target: d.target ?? DEFAULT_DIMENSION_TARGET,
          })),
        );
        setStep(1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'The AI could not read your job description. Try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const finalSchema: JDSchema | undefined = schema
        ? {
            ...schema,
            scoring_dimensions: dims.map((d) => ({
              name: d.name,
              description: '',
              weight: 1.0,
              target: d.target,
            })),
          }
        : undefined;
      const position = await createPosition({
        jd_text: jdText,
        title: schema?.position_title,
        stages: stages.map((s) => s.value),
        extracted_schema: finalSchema,
        auto_match: true,
      });
      toast.success('✅ Position created! Searching your candidate pool now — this takes about 30 seconds.');
      navigate(`/positions/${position.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong creating the position.');
    } finally {
      setBusy(false);
    }
  };

  function reorderByKeys<T extends { key: string }>(items: T[], orderedKeys: string[]): T[] {
    return orderedKeys.map((key) => items.find((item) => item.key === key)!).filter(Boolean);
  }

  const canGoNext =
    (step === 0 && jdText.trim().length > 30) ||
    (step === 1 && Boolean(schema?.position_title)) ||
    (step === 2 && dims.length >= 1) ||
    (step === 3 && stages.length >= 2);

  return (
    <WizardShell
      title="New Position"
      steps={STEPS}
      currentStep={step}
      canGoNext={canGoNext}
      busy={busy}
      nextLabel={step === 3 ? 'Create Position ✓' : step === 0 ? 'Analyze →' : 'Next →'}
      onBack={() => setStep(Math.max(0, step - 1))}
      onNext={handleNext}
    >
      {step === 0 && (
        <div>
          <h2 className="font-semibold">Paste your Job Description</h2>
          <p className="mt-1 text-sm text-slate-500">
            The AI will read it and set up scoring automatically.
          </p>
          <div
            {...getRootProps()}
            className={`mt-4 rounded-lg border-2 border-dashed p-2 ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
            }`}
          >
            <input {...getInputProps()} />
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              rows={12}
              placeholder="Drop a JD file here, or paste the text…"
              aria-label="Job description text"
              className="w-full resize-none border-0 bg-transparent p-2 text-sm focus:outline-none"
            />
          </div>
        </div>
      )}

      {step === 1 && schema && (
        <div className="space-y-4">
          <h2 className="font-semibold">Review extracted details</h2>
          <p className="text-sm text-slate-500">The AI pulled these from your JD. Correct anything that looks off.</p>
          <label className="block text-sm">
            <span className="font-medium">Job title</span>
            <input
              value={schema.position_title}
              onChange={(e) => setSchema({ ...schema, position_title: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="font-medium">Seniority</span>
              <select
                value={schema.seniority_level}
                onChange={(e) => setSchema({ ...schema, seniority_level: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {['junior', 'mid', 'senior', 'lead', 'principal'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="font-medium">Work style</span>
              <select
                value={schema.remote_preference ?? 'flexible'}
                onChange={(e) => setSchema({ ...schema, remote_preference: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {['remote', 'hybrid', 'on-site', 'flexible'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="text-sm font-medium">Required skills</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {schema.required_skills.map((skill, i) => (
                <span key={`${skill}-${i}`} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  {skill}
                  <button
                    onClick={() =>
                      setSchema({
                        ...schema,
                        required_skills: schema.required_skills.filter((_, j) => j !== i),
                      })
                    }
                    aria-label={`Remove ${skill}`}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="flex items-center font-semibold">
            Scoring dimensions
            <InfoTooltip text="These are the qualities the AI will rate each candidate on (1–10). They're automatically pulled from the job description." />
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Drag to reorder by importance. Set each one's <strong>target</strong> — the minimum
            score (1–10) a candidate should reach. Used to flag who clears the bar.
          </p>
          <div className="mt-4">
            <SortableList
              ids={dims.map((d) => d.key)}
              onReorder={(keys) => setDims(reorderByKeys(dims, keys))}
              renderItem={(key) => {
                const dim = dims.find((d) => d.key === key)!;
                return (
                  <>
                    <input
                      value={dim.name}
                      onChange={(e) =>
                        setDims(dims.map((d) => (d.key === key ? { ...d, name: e.target.value } : d)))
                      }
                      aria-label="Dimension name"
                      className="flex-1 rounded border-0 px-2 py-1 text-sm font-medium focus:bg-slate-50 focus:outline-none"
                    />
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      target ≥
                      <select
                        value={dim.target}
                        onChange={(e) =>
                          setDims(
                            dims.map((d) =>
                              d.key === key ? { ...d, target: Number(e.target.value) } : d,
                            ),
                          )
                        }
                        aria-label={`Target score for ${dim.name}`}
                        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={() => setDims(dims.filter((d) => d.key !== key))}
                      aria-label={`Remove ${dim.name}`}
                      className="px-2 text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </>
                );
              }}
            />
          </div>
          <button
            onClick={() =>
              setDims([...dims, { key: nextKey('dim'), name: 'New dimension', target: DEFAULT_DIMENSION_TARGET }])
            }
            className="mt-3 text-sm font-medium text-brand-600 hover:underline"
          >
            + Add dimension
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="flex items-center font-semibold">
            Pipeline stages
            <InfoTooltip text="Where candidates are in your hiring process. Drag them between stages or ask the chat assistant to move them." />
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Drag to reorder your hiring steps. Defaults work for most roles.
          </p>
          <div className="mt-4">
            <SortableList
              ids={stages.map((s) => s.key)}
              onReorder={(keys) => setStages(reorderByKeys(stages, keys))}
              renderItem={(key) => {
                const stage = stages.find((s) => s.key === key)!;
                return (
                  <>
                    <input
                      value={stage.value}
                      onChange={(e) =>
                        setStages(stages.map((s) => (s.key === key ? { ...s, value: e.target.value } : s)))
                      }
                      aria-label="Stage name"
                      className="flex-1 rounded border-0 px-2 py-1 text-sm focus:bg-slate-50 focus:outline-none"
                    />
                    <button
                      onClick={() => setStages(stages.filter((s) => s.key !== key))}
                      aria-label={`Remove ${stage.value}`}
                      className="px-2 text-slate-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </>
                );
              }}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              placeholder="New stage name"
              aria-label="New stage name"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => {
                if (newStage.trim()) {
                  setStages([...stages, { key: nextKey('stage'), value: newStage.trim() }]);
                  setNewStage('');
                }
              }}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              + Add stage
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
}
