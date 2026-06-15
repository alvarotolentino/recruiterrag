import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import type { ChatEnvelopeData } from '../../../types';

export interface RadarRendererProps {
  data: ChatEnvelopeData;
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea'];

export function RadarRenderer({ data }: RadarRendererProps) {
  const candidates = (data.candidates ?? []).filter((c) => c.scores && c.scores.length > 0);
  if (candidates.length === 0) return null;

  const dimensions = candidates[0].scores!.map((s) => s.dimension);
  const chartData = dimensions.map((dim) => {
    const row: Record<string, string | number> = { dimension: dim };
    for (const c of candidates) {
      row[c.name] = c.scores!.find((s) => s.dimension === dim)?.score ?? 0;
    }
    return row;
  });

  return (
    <div className="mt-2 h-72 w-full">
      <ResponsiveContainer>
        <RadarChart data={chartData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
          {candidates.map((c, i) => (
            <Radar
              key={c.name}
              name={c.name}
              dataKey={c.name}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.25}
            />
          ))}
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
