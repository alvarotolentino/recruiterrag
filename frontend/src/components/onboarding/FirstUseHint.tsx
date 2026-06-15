import { useOnboardingStore } from '../../store/onboardingStore';

export interface FirstUseHintProps {
  id: string;
  text: string;
}

/** Dismissible one-time hint banner, persisted in localStorage (spec §14.2.4). */
export function FirstUseHint({ id, text }: FirstUseHintProps) {
  const dismissed = useOnboardingStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useOnboardingStore((s) => s.dismissHint);
  if (dismissed) return null;
  return (
    <div className="flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
      <span>💡 {text}</span>
      <button
        onClick={() => dismissHint(id)}
        aria-label="Dismiss hint"
        className="ml-3 text-brand-400 hover:text-brand-600"
      >
        ✕
      </button>
    </div>
  );
}
