import { create } from 'zustand';

const HINTS_KEY = 'recruiterrag.dismissedHints';

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HINTS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

interface OnboardingState {
  tourRunning: boolean;
  dismissedHints: string[];
  startTour: () => void;
  stopTour: () => void;
  dismissHint: (id: string) => void;
  isHintDismissed: (id: string) => boolean;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  tourRunning: false,
  dismissedHints: loadDismissed(),
  startTour: () => set({ tourRunning: true }),
  stopTour: () => set({ tourRunning: false }),
  dismissHint: (id) => {
    const next = [...get().dismissedHints, id];
    localStorage.setItem(HINTS_KEY, JSON.stringify(next));
    set({ dismissedHints: next });
  },
  isHintDismissed: (id) => get().dismissedHints.includes(id),
}));
