import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import type { DimensionScore } from '../../types';

export interface ScoreSpiderProps {
  scores: DimensionScore[];
  name?: string;
}

export function ScoreSpider({ scores, name = 'Fit' }: ScoreSpiderProps) {
  if (scores.length === 0) return null;
  const data = scores.map((s) => ({ dimension: s.dimension, score: s.score }));
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} />
          <Radar name={name} dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
