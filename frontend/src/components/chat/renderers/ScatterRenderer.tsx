import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChatEnvelopeData } from '../../../types';

export interface ScatterRendererProps {
  data: ChatEnvelopeData;
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2'];

export function ScatterRenderer({ data }: ScatterRendererProps) {
  const points = data.scatter ?? [];
  if (points.length === 0) return null;
  return (
    <div className="mt-2 h-72 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            name={data.x_label ?? 'X'}
            label={{ value: data.x_label ?? '', position: 'insideBottom', offset: -10, fontSize: 12 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            dataKey="y"
            name={data.y_label ?? 'Y'}
            label={{ value: data.y_label ?? '', angle: -90, position: 'insideLeft', fontSize: 12 }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(value: number) => value}
            labelFormatter={() => ''}
            content={({ payload }) =>
              payload && payload.length > 0 ? (
                <div className="rounded bg-slate-800 px-2 py-1 text-xs text-white">
                  {(payload[0].payload as { name: string }).name}
                </div>
              ) : null
            }
          />
          <Scatter data={points}>
            {points.map((p, i) => (
              <Cell key={p.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
