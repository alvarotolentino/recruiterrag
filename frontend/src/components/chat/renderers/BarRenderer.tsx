import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChatEnvelopeData } from '../../../types';

export interface BarRendererProps {
  data: ChatEnvelopeData;
}

export function BarRenderer({ data }: BarRendererProps) {
  const candidates = (data.candidates ?? []).filter((c) => typeof c.fit_score === 'number');
  if (candidates.length === 0) return null;
  const chartData = candidates.map((c) => ({ name: c.name, fit: c.fit_score }));
  return (
    <div className="mt-2 h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 30, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="fit" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
