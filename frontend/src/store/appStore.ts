import { create } from 'zustand';

interface ActiveJob {
  id: string;
  kind: 'ingestion' | 'scoring' | 'training';
  label: string;
  progress?: number;
}

interface AppState {
  selectedPositionId: string | null;
  activeJobs: ActiveJob[];
  setSelectedPosition: (id: string | null) => void;
  addJob: (job: ActiveJob) => void;
  updateJobProgress: (id: string, progress: number) => void;
  removeJob: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedPositionId: null,
  activeJobs: [],
  setSelectedPosition: (id) => set({ selectedPositionId: id }),
  addJob: (job) =>
    set((s) => ({ activeJobs: [...s.activeJobs.filter((j) => j.id !== job.id), job] })),
  updateJobProgress: (id, progress) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) => (j.id === id ? { ...j, progress } : j)),
    })),
  removeJob: (id) => set((s) => ({ activeJobs: s.activeJobs.filter((j) => j.id !== id) })),
}));
