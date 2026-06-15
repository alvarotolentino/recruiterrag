import type { DashboardPeriod } from '../../types';

const OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export interface PeriodToggleProps {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}

/** Segmented control scoping the dashboard's period-based numbers (spec §14). */
export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div
      role="group"
      aria-label="Time period"
      className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
