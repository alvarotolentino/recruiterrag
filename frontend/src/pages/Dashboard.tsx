import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDashboardMetrics, getPipelineSummary, getStageDurations } from '../api/client';
import { MetricTile } from '../components/dashboard/MetricTile';
import { OpenPipelines } from '../components/dashboard/OpenPipelines';
import { PeriodToggle } from '../components/dashboard/PeriodToggle';
import { PipelineProgressChart } from '../components/dashboard/PipelineProgressChart';
import { EmptyState } from '../components/shared/EmptyState';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { StatusBadge } from '../components/shared/StatusBadge';
import { FirstUseHint } from '../components/onboarding/FirstUseHint';
import type { DashboardPeriod } from '../types';

const STATUS_COLORS: Record<string, string> = {
  open: '#16a34a',
  paused: '#d97706',
  closed_filled: '#2563eb',
  closed_cancelled: '#94a3b8',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  paused: 'Paused',
  closed_filled: 'Filled',
  closed_cancelled: 'Cancelled',
};

const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  week: 'this week',
  month: 'this month',
  year: 'this year',
};

/** Format a bucket string (ISO date or YYYY-MM) into a readable x-axis tick. */
function formatBucket(bucket: string, period: DashboardPeriod): string {
  try {
    if (period === 'year') {
      // bucket = "2026-06"
      return new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${bucket}-01`));
    }
    // bucket = "2026-06-15"
    const date = new Date(`${bucket}T00:00:00`);
    if (period === 'week') {
      return new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric' }).format(date);
    }
    // month
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return bucket;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<DashboardPeriod>('month');

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard', 'metrics', period],
    queryFn: () => getDashboardMetrics(period),
  });
  const { data: pipelines } = useQuery({
    queryKey: ['dashboard', 'pipelines'],
    queryFn: getPipelineSummary,
  });
  const { data: stageDurations } = useQuery({
    queryKey: ['dashboard', 'stage-durations'],
    queryFn: getStageDurations,
  });

  if (isLoading || !metrics) return <LoadingSpinner label="Loading your dashboard…" />;

  if (metrics.total_positions === 0) {
    return (
      <div className="mx-auto max-w-2xl pt-12" data-tour="dashboard">
        <EmptyState
          icon="📋"
          title="No positions open yet"
          message="Create your first position to start finding great candidates."
        >
          <button
            onClick={() => navigate('/positions/new')}
            data-tour="new-position"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Create Position
          </button>
        </EmptyState>
      </div>
    );
  }

  const open = (pipelines ?? []).filter((p) => p.status === 'open' || p.status === 'paused');
  const archived = (pipelines ?? []).filter((p) => p.status.startsWith('closed'));
  const periodLabel = PERIOD_LABEL[period];
  const { candidates: cd, stage: st } = metrics;

  // Derived Pipeline-stage insights (no backend change — computed from stage_breakdown).
  const stageTotal = metrics.stage_breakdown.reduce((sum, s) => sum + s.count, 0);
  const busiestStage = metrics.stage_breakdown.reduce<{ stage: string; count: number } | null>(
    (top, s) => (s.count > 0 && (!top || s.count > top.count) ? s : top),
    null,
  );
  const reachedFinalPct = stageTotal > 0 ? Math.round((st.final_candidates / stageTotal) * 100) : 0;

  return (
    <div className="space-y-6" data-tour="dashboard">
      <FirstUseHint id="dashboard" text="This is your home base. All your open job pipelines live here." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <PeriodToggle value={period} onChange={setPeriod} />
          <Link
            to="/positions/new"
            data-tour="new-position"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + New Position
          </Link>
        </div>
      </div>

      {/* ── Overview tiles ── */}
      <div data-tour="overview-tiles" className="grid gap-4 lg:grid-cols-3">
        <MetricTile
          title="Pipelines"
          info="Your job pipelines by status. The small +N shows how many opened or closed during the selected period."
          periodLabel={periodLabel}
        >
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={metrics.status_breakdown.filter((s) => s.count > 0)}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ status, count }) =>
                    `${STATUS_LABELS[status] ?? status}: ${count}`
                  }
                  labelLine={true}
                >
                  {metrics.status_breakdown
                    .filter((s) => s.count > 0)
                    .map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
                    ))}
                </Pie>
                <Tooltip formatter={(v, name) => [v, STATUS_LABELS[name as string] ?? name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </MetricTile>

        <MetricTile
          title="Candidates"
          info="People moving through your pipelines. 'In play' counts candidates in open pipelines; 'unique' de-duplicates people who appear in more than one."
          periodLabel={periodLabel}
          stats={[
            { label: 'In play', value: cd.in_play, delta: cd.in_play_new },
            { label: 'Unique in pipelines', value: cd.unique, delta: cd.unique_new },
            { label: 'New registered', value: cd.new_registered, hint: periodLabel },
          ]}
        >
          <div className="h-44">
            <ResponsiveContainer>
              <AreaChart
                data={metrics.registration_trend}
                margin={{ top: 4, right: 4, bottom: period === 'month' ? 12 : 4, left: 0 }}
              >
                <defs>
                  <linearGradient id="regTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(v) => formatBucket(v, period)}
                  interval={period === 'month' ? 4 : 0}
                  tick={{ fontSize: 9 }}
                  angle={period === 'month' ? -30 : 0}
                  textAnchor={period === 'month' ? 'end' : 'middle'}
                  height={period === 'month' ? 36 : 20}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  labelFormatter={(v) => formatBucket(String(v), period)}
                  formatter={(v: number) => [v, 'registered']}
                />
                <Area type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} fill="url(#regTrend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </MetricTile>

        <MetricTile
          title="Pipeline stages"
          info="Where candidates sit across your open pipelines. 'Busiest stage' is where the most people are waiting. 'Reached final' is the share now at offer or hired. 'Stage moves' counts every advance during the period."
          periodLabel={periodLabel}
          stats={[
            {
              label: 'Busiest stage',
              value: busiestStage?.stage ?? '—',
              hint: busiestStage ? `${busiestStage.count} waiting` : undefined,
            },
            { label: 'In final stage', value: st.final_candidates, hint: 'offer / hired' },
            { label: 'Reached final', value: `${reachedFinalPct}%`, hint: 'of all candidates' },
            { label: 'Stage moves', value: st.moves, hint: `${st.avg_moves_per_pipeline} avg / pipeline` },
          ]}
        >
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={metrics.stage_breakdown} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={36} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </MetricTile>
      </div>

      {/* ── Pipeline progress (stages × days) ── */}
      <PipelineProgressChart data={stageDurations ?? []} />

      {/* ── Open pipelines (board / sortable list) ── */}
      <OpenPipelines pipelines={open} />

      {archived.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-500">Archive</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {archived.map((p) => (
              <Link
                key={p.position_id}
                to={`/positions/${p.position_id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-75 hover:opacity-100"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium">{p.title}</h3>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{p.candidate_count} candidates</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
