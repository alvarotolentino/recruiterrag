import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface WizardShellProps {
  title: string;
  steps: string[];
  currentStep: number; // 0-based
  canGoNext: boolean;
  nextLabel?: string;
  busy?: boolean;
  hideNav?: boolean;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
}

/** Reusable wizard frame: step indicator, validated nav, animated transitions (spec §14.4). */
export function WizardShell({
  title,
  steps,
  currentStep,
  canGoNext,
  nextLabel,
  busy = false,
  hideNav = false,
  onBack,
  onNext,
  children,
}: WizardShellProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold">{title}</h1>

      <nav aria-label="Wizard progress" className="mt-4 flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i < currentStep
                  ? 'bg-brand-600 text-white'
                  : i === currentStep
                    ? 'border-2 border-brand-600 text-brand-700'
                    : 'border border-slate-300 text-slate-400'
              }`}
              aria-current={i === currentStep ? 'step' : undefined}
            >
              {i < currentStep ? '✓' : i + 1}
            </span>
            <span
              className={`hidden text-xs sm:block ${i === currentStep ? 'font-semibold' : 'text-slate-400'}`}
            >
              {step}
            </span>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
          </div>
        ))}
      </nav>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {!hideNav && (
        <div className="mt-4 flex justify-between">
          <button
            onClick={onBack}
            disabled={currentStep === 0 || busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext || busy}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? 'Working…' : (nextLabel ?? 'Next →')}
          </button>
        </div>
      )}
    </div>
  );
}
