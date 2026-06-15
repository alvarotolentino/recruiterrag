// Stable color per pipeline stage. Known stages get intent-based colors;
// custom stages fall back to a deterministic palette so each is visually distinct.
const KNOWN: Record<string, string> = {
  new: '#94a3b8',
  screening: '#0ea5e9',
  'technical interview': '#6366f1',
  'cultural interview': '#a855f7',
  interview: '#6366f1',
  offer: '#f59e0b',
  hired: '#16a34a',
  rejected: '#ef4444',
};

const PALETTE = ['#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#14b8a6', '#8b5cf6', '#22c55e'];

export function stageColor(stage: string): string {
  const known = KNOWN[stage.toLowerCase()];
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < stage.length; i++) hash = (hash * 31 + stage.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// Ordinal ramp for seniority — single-hue light→dark reads as a rank (not rainbow).
export const SENIORITY_COLORS: Record<string, string> = {
  junior: '#bfdbfe',
  mid: '#7dadf5',
  senior: '#4f86e6',
  lead: '#3b5bdb',
  principal: '#1e3a8a',
  unknown: '#cbd5e1',
};
export const SENIORITY_ORDER = ['junior', 'mid', 'senior', 'lead', 'principal'];

export function seniorityColor(seniority: string): string {
  return SENIORITY_COLORS[seniority.toLowerCase()] ?? SENIORITY_COLORS.unknown;
}

// Colorblind-safe categorical palette (Tableau 10) for skill clusters.
export const CLUSTER_PALETTE = [
  '#4e79a7', '#f28e2b', '#59a14f', '#e15759',
  '#b07aa1', '#76b7b2', '#edc948', '#ff9da7',
];
export const clusterColor = (id: number): string => CLUSTER_PALETTE[id % CLUSTER_PALETTE.length];

// Continuous green→blue→purple ramp for years of experience.
export function experienceColor(years: number | null, maxYears: number): string {
  if (years == null) return '#cbd5e1';
  const t = Math.max(0, Math.min(1, years / Math.max(maxYears, 1)));
  // interpolate across three stops
  const stops = [
    [0x22, 0xc5, 0x5e], // green  (low)
    [0x0e, 0xa5, 0xe9], // blue   (mid)
    [0x7c, 0x3a, 0xed], // purple (high)
  ];
  const seg = t < 0.5 ? 0 : 1;
  const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [a, b] = [stops[seg], stops[seg + 1]];
  const ch = (i: number) => Math.round(a[i] + (b[i] - a[i]) * local);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
