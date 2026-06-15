import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../../api/client';
import { useOnboardingStore } from '../../store/onboardingStore';
import { QuickStartChecklist } from './QuickStartChecklist';

export interface HelpSidebarProps {
  open: boolean;
  onClose: () => void;
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'What file types can I upload?',
    a: 'PDF, Word (.docx), plain text, Markdown, and images (PNG, JPG, TIFF). Scanned documents are read with text recognition.',
  },
  {
    q: 'How does scoring work?',
    a: 'The AI reads each resume against the qualities pulled from your job description and rates every candidate 1–10 on each one.',
  },
  {
    q: 'How do I close a pipeline?',
    a: 'Open the position and click "Close Pipeline". Pick "Position Filled" or "Cancelled". Everything is kept and viewable afterwards.',
  },
];

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
      aria-label={ok ? 'OK' : 'Unavailable'}
    />
  );
}

export function HelpSidebar({ open, onClose }: HelpSidebarProps) {
  const startTour = useOnboardingStore((s) => s.startTour);
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  if (!open) return null;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-80 overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Help</h2>
        <button onClick={onClose} aria-label="Close help" className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-5">
        <QuickStartChecklist />

        <button
          onClick={() => {
            onClose();
            startTour();
          }}
          className="w-full rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          ▶ Replay the tour
        </button>

        <section>
          <h3 className="mb-2 text-sm font-semibold">FAQ</h3>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
                <p className="mt-2 text-sm text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">System status</h3>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between">
              <span>AI assistant</span>
              <StatusDot ok={health?.ollama === 'ok'} />
            </li>
            <li className="flex items-center justify-between">
              <span>Candidate search</span>
              <StatusDot ok={health?.milvus === 'ok'} />
            </li>
            <li className="flex items-center justify-between">
              <span>File storage</span>
              <StatusDot ok={health?.storage === 'ok'} />
            </li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
