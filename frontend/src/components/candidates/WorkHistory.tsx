import type { WorkExperience } from '../../types';

export interface WorkHistoryProps {
  experience: WorkExperience[];
}

function dateRange(role: WorkExperience): string {
  const end = role.is_current ? 'Present' : role.end_date ?? '';
  if (role.start_date && end) return `${role.start_date} – ${end}`;
  return role.start_date ?? end ?? '';
}

/** Professional experience timeline, most-recent first (spec §4.1: matching context). */
export function WorkHistory({ experience }: WorkHistoryProps) {
  if (experience.length === 0) {
    return <p className="text-sm text-slate-400">No work history was extracted from this resume.</p>;
  }
  return (
    <ol className="relative ml-2 space-y-5 border-l border-slate-200 pl-5">
      {experience.map((role, i) => (
        <li key={`${role.company}-${role.title}-${i}`} className="relative">
          <span
            className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
              role.is_current ? 'bg-green-500' : 'bg-brand-500'
            }`}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold">{role.title}</p>
            <span className="text-xs text-slate-500">{dateRange(role)}</span>
          </div>
          <p className="text-sm text-slate-600">{role.company}</p>
          {role.responsibilities.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-slate-600">
              {role.responsibilities.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
