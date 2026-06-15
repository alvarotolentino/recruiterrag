import { DEFAULT_DIMENSION_TARGET, type ScoringDimension } from '../../types';

export interface DimensionEditorProps {
  dimensions: ScoringDimension[];
  onChange: (dimensions: ScoringDimension[]) => void;
}

/** Inline editor for a position's scoring dimensions and their target scores. */
export function DimensionEditor({ dimensions, onChange }: DimensionEditorProps) {
  const update = (index: number, patch: Partial<ScoringDimension>) =>
    onChange(dimensions.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  return (
    <div className="space-y-2">
      {dimensions.map((d, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <input
            value={d.name}
            onChange={(e) => update(i, { name: e.target.value })}
            aria-label="Dimension name"
            className="flex-1 rounded border-0 px-2 py-1 text-sm font-medium focus:bg-slate-50 focus:outline-none"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500">
            target ≥
            <select
              value={d.target ?? DEFAULT_DIMENSION_TARGET}
              onChange={(e) => update(i, { target: Number(e.target.value) })}
              aria-label={`Target score for ${d.name}`}
              className="rounded border border-slate-300 px-1 py-0.5 text-xs"
            >
              {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => onChange(dimensions.filter((_, j) => j !== i))}
            aria-label={`Remove ${d.name}`}
            className="px-2 text-slate-400 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...dimensions,
            { name: 'New dimension', description: '', weight: 1.0, target: DEFAULT_DIMENSION_TARGET },
          ])
        }
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        + Add dimension
      </button>
    </div>
  );
}
