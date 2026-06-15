import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PipelineStageDurations } from '../../types';
import { stageColor } from '../../utils/stageColors';
import { InfoTooltip } from '../shared/InfoTooltip';

export interface PipelineProgressChartProps {
  data: PipelineStageDurations[];
}

/** Truncate long pipeline title for the Y-axis label. */
function truncate(s: string, max = 22): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

interface FlatRow {
  title: string;
  title_short: string;
  [stage: string]: string | number | boolean | null;
}

interface ChartModel {
  rows: FlatRow[];
  stageKeys: string[];
}

/**
 * Flatten PipelineStageDurations[] into recharts-compatible rows.
 * Each row = one pipeline. Each stage becomes two keys:
 *   `<stage>` → avg_days (number | null)
 *   `<stage>__ip` → in_progress (boolean)
 */
function buildModel(data: PipelineStageDurations[]): ChartModel {
  // Collect ordered unique stage names (first-seen order across all pipelines).
  const stageKeys: string[] = [];
  for (const p of data) {
    for (const s of p.stages) {
      if (!stageKeys.includes(s.stage)) stageKeys.push(s.stage);
    }
  }

  const rows: FlatRow[] = data.map((p) => {
    const row: FlatRow = {
      title: p.title,
      title_short: truncate(p.title),
    };
    for (const key of stageKeys) {
      const sp = p.stages.find((s) => s.stage === key);
      row[key] = sp && sp.avg_days != null ? sp.avg_days : null;
      row[`${key}__ip`] = !!(sp && sp.in_progress);
    }
    return row;
  });

  return { rows, stageKeys };
}

interface TooltipEntry {
  dataKey?: string;
  name?: string;
  value?: number | null;
  color?: string;
  payload?: FlatRow;
}

function StackedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const visible = payload.filter((e) => e.value != null && (e.value as number) > 0);
  if (visible.length === 0) return null;

  const fullTitle = payload[0]?.payload?.title ?? label;
  return (
    <div className="max-w-[260px] rounded-lg bg-slate-800 px-3 py-2.5 text-xs text-white shadow-lg">
      <p className="mb-2 font-semibold leading-tight">{fullTitle}</p>
      <table className="w-full border-collapse">
        <tbody>
          {visible.map((e) => {
            const ip = e.dataKey && e.payload?.[`${e.dataKey}__ip`] === true;
            const candidates = e.dataKey
              ? (payload[0]?.payload as FlatRow | undefined)
              : undefined;
            void candidates; // accessed below via original data if needed
            return (
              <tr key={e.dataKey}>
                <td className="pr-2 py-0.5">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ background: e.color }}
                  />
                </td>
                <td className="pr-3 py-0.5 text-slate-300">{e.name}</td>
                <td className="py-0.5 font-medium tabular-nums">{e.value}d</td>
                {ip && (
                  <td className="py-0.5 pl-2 text-amber-300">in progress</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Custom bar shape: renders stripe pattern overlay when the stage is in-progress. */
function StageBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  dataKey?: string;
  payload?: FlatRow;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill, dataKey, payload } = props;
  if (!width || !height) return null;
  const inProgress = dataKey && payload?.[`${dataKey}__ip`] === true;
  const patternId = `stripe-${(dataKey ?? '').replace(/\s+/g, '-')}`;

  return (
    <g>
      {inProgress && (
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" fill={fill ?? '#888'} fillOpacity={0.55} />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="#fff"
              strokeWidth="3"
              strokeOpacity={0.35}
            />
          </pattern>
        </defs>
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={inProgress ? `url(#${patternId})` : (fill ?? '#888')}
        rx={2}
        ry={2}
      />
    </g>
  );
}

export function PipelineProgressChart({ data }: PipelineProgressChartProps) {
  const hasData = data.some((p) => p.stages.some((s) => s.avg_days != null && s.avg_days > 0));

  return (
    <section
      data-tour="progress-chart"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <header className="mb-1 flex items-center gap-1">
        <h2 className="text-sm font-semibold text-slate-800">
          Pipeline progress — time budget per stage
        </h2>
        <InfoTooltip text="Each bar is one open pipeline. Segments show how many days candidates spent in each stage on average. Striped segments mean a candidate is still sitting in that stage right now." />
      </header>
      <p className="mb-3 text-xs text-slate-400">
        Wider segment = more time in that stage. Striped = in progress.
      </p>

      {!hasData ? (
        <p className="py-16 text-center text-sm text-slate-400">
          Move candidates between stages to see how long each stage takes.
        </p>
      ) : (
        (() => {
          const { rows, stageKeys } = buildModel(data);
          const chartHeight = Math.max(160, rows.length * 52);
          return (
            <div style={{ height: chartHeight }}>
              <ResponsiveContainer>
                <BarChart
                  layout="vertical"
                  data={rows}
                  margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                  barSize={24}
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    label={{
                      value: 'Days',
                      position: 'insideBottomRight',
                      offset: -4,
                      style: { fontSize: 10, fill: '#64748b' },
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="title_short"
                    tick={{ fontSize: 11 }}
                    width={130}
                  />
                  <Tooltip content={<StackedTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (
                      <span className="text-slate-600">{value}</span>
                    )}
                  />
                  {stageKeys.map((stage) => (
                    <Bar
                      key={stage}
                      dataKey={stage}
                      name={stage}
                      fill={stageColor(stage)}
                      stackId="timeline"
                      shape={(props: object) => (
                        <StageBar
                          {...(props as Parameters<typeof StageBar>[0])}
                          dataKey={stage}
                        />
                      )}
                    >
                      {rows.map((row) => (
                        <Cell
                          key={row.title}
                          fill={stageColor(stage)}
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })()
      )}
    </section>
  );
}
