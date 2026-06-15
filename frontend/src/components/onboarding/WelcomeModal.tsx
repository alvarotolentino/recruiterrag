export interface WelcomeModalProps {
  open: boolean;
  onStartTour: () => void;
  onSkip: () => void;
}

export function WelcomeModal({ open, onStartTour, onSkip }: WelcomeModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to RecruiterRAG"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <p className="text-4xl" aria-hidden>
          👋
        </p>
        <h1 className="mt-3 text-2xl font-bold">Welcome to RecruiterRAG</h1>
        <p className="mt-3 text-slate-600">
          Your AI-powered recruiting assistant — running entirely on your computer.
        </p>
        <p className="mt-2 text-slate-600">Let me show you how it works in 60 seconds.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onStartTour}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Start the Tour
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-slate-600 hover:bg-slate-50"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
