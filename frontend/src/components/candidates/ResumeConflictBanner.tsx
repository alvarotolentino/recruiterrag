import { useState } from 'react';

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  work_experience: 'Professional experience',
  tech_stack: 'Skills',
  current_role: 'Current role',
  years_exp: 'Years of experience',
  seniority: 'Seniority',
  remote_pref: 'Work style',
  location: 'Location',
  education: 'Education',
  languages: 'Languages',
};

interface ResumeConflictBannerProps {
  section: string;
  newValue: string;
  onUseNew: () => void;
  onKeep: () => void;
}

export function ResumeConflictBanner({ section, newValue, onUseNew, onKeep }: ResumeConflictBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const label = SECTION_LABELS[section] ?? section;

  const displayValue = (() => {
    try {
      const parsed = JSON.parse(newValue);
      if (Array.isArray(parsed)) return parsed.join(', ') || '(empty)';
      return JSON.stringify(parsed, null, 2);
    } catch {
      return newValue;
    }
  })();

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-amber-500">⚠</span>
        <div className="flex-1">
          <p className="font-medium text-amber-800">
            New resume has a different {label}. You customized this section.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              {expanded ? 'Hide new version ▲' : 'View new version ▾'}
            </button>
            <button
              type="button"
              onClick={onUseNew}
              className="rounded-md bg-amber-600 px-2 py-0.5 text-xs text-white hover:bg-amber-700"
            >
              Use new version
            </button>
            <button
              type="button"
              onClick={onKeep}
              className="rounded-md border border-amber-300 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
            >
              Keep mine
            </button>
          </div>
          {expanded && (
            <pre className="mt-2 max-h-40 overflow-auto rounded border border-amber-200 bg-white p-2 text-xs text-slate-700 whitespace-pre-wrap">
              {displayValue}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
