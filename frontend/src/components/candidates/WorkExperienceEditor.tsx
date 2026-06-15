import type { WorkExperience } from '../../types';

interface WorkExperienceEditorProps {
  experience: WorkExperience[];
  onChange: (v: WorkExperience[]) => void;
}

function blankRole(): WorkExperience {
  return { company: '', title: '', start_date: '', end_date: null, is_current: false, responsibilities: [] };
}

function RoleCard({
  role,
  index,
  onChange,
  onDelete,
}: {
  role: WorkExperience;
  index: number;
  onChange: (updated: WorkExperience) => void;
  onDelete: () => void;
}) {
  const set = (field: keyof WorkExperience, value: unknown) =>
    onChange({ ...role, [field]: value });

  const updateResp = (i: number, val: string) => {
    const updated = [...role.responsibilities];
    updated[i] = val;
    onChange({ ...role, responsibilities: updated });
  };

  const addResp = () => onChange({ ...role, responsibilities: [...role.responsibilities, ''] });
  const removeResp = (i: number) =>
    onChange({ ...role, responsibilities: role.responsibilities.filter((_, j) => j !== i) });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">Role {index + 1}</span>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-slate-500">Title</label>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            value={role.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Software Engineer"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-slate-500">Company</label>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            value={role.company}
            onChange={(e) => set('company', e.target.value)}
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-slate-500">Start</label>
          <input
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none"
            value={role.start_date ?? ''}
            onChange={(e) => set('start_date', e.target.value || null)}
            placeholder="Jan 2020"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-slate-500">End</label>
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
              value={role.is_current ? '' : (role.end_date ?? '')}
              onChange={(e) => set('end_date', e.target.value || null)}
              placeholder="Dec 2022"
              disabled={role.is_current}
            />
            <label className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
              <input
                type="checkbox"
                checked={role.is_current ?? false}
                onChange={(e) => set('is_current', e.target.checked)}
                className="accent-brand-600"
              />
              Current
            </label>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[11px] text-slate-500">Responsibilities</label>
          <button
            type="button"
            onClick={addResp}
            className="text-[11px] text-brand-600 hover:underline"
          >
            + Add
          </button>
        </div>
        <div className="space-y-1">
          {role.responsibilities.map((r, i) => (
            <div key={i} className="flex items-start gap-1">
              <textarea
                rows={2}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                value={r}
                onChange={(e) => updateResp(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeResp(i)}
                className="mt-1 text-xs text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
          {role.responsibilities.length === 0 && (
            <p className="text-[11px] text-slate-400">No responsibilities listed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkExperienceEditor({ experience, onChange }: WorkExperienceEditorProps) {
  const update = (index: number, updated: WorkExperience) => {
    const next = [...experience];
    next[index] = updated;
    onChange(next);
  };

  const remove = (index: number) => onChange(experience.filter((_, i) => i !== index));

  const addRole = () => onChange([blankRole(), ...experience]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={addRole}
        className="w-full rounded-lg border border-dashed border-brand-300 py-2 text-sm text-brand-600 hover:bg-brand-50"
      >
        + Add role
      </button>
      {experience.map((role, i) => (
        <RoleCard
          key={i}
          role={role}
          index={i}
          onChange={(updated) => update(i, updated)}
          onDelete={() => remove(i)}
        />
      ))}
      {experience.length === 0 && (
        <p className="text-sm text-slate-400">No work history yet.</p>
      )}
    </div>
  );
}
