import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Route, Routes } from 'react-router-dom';
import { getSettings, listTrainingRuns, putSetting } from './api/client';
import { GuidedTour } from './components/onboarding/GuidedTour';
import { HelpSidebar } from './components/onboarding/HelpSidebar';
import { WelcomeModal } from './components/onboarding/WelcomeModal';
import { AdapterComparison } from './components/post-training/AdapterComparison';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { CandidateIngestionWizard } from './components/wizards/CandidateIngestionWizard';
import { NewPositionWizard } from './components/wizards/NewPositionWizard';
import { PostTrainingWizard } from './components/wizards/PostTrainingWizard';
import CandidateDetail from './pages/CandidateDetail';
import CandidateList from './pages/CandidateList';
import Dashboard from './pages/Dashboard';
import PositionDetail from './pages/PositionDetail';
import PositionList from './pages/PositionList';
import PostTraining from './pages/PostTraining';
import { useOnboardingStore } from './store/onboardingStore';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', tour: 'nav-dashboard' },
  { to: '/positions', label: 'Positions', icon: '📋', tour: 'nav-positions' },
  { to: '/candidates', label: 'Candidates', icon: '👤', tour: 'nav-candidates' },
  { to: '/training', label: 'Teach Your AI', icon: '🎓', tour: 'nav-training' },
];

function TrainingBadge() {
  const { data: runs } = useQuery({
    queryKey: ['training', 'runs'],
    queryFn: listTrainingRuns,
    refetchInterval: 30_000,
  });
  const active = (runs ?? []).some((r) => r.status === 'running' || r.status === 'queued');
  if (!active) return null;
  return (
    <span
      className="ml-auto inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500"
      aria-label="Training in progress"
    />
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const startTour = useOnboardingStore((s) => s.startTour);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const onboardingMutation = useMutation({
    mutationFn: () => putSetting('onboarding_complete', 'true'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  const showWelcome = settings?.onboarding_complete === 'false';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <h1 className="text-lg font-bold text-brand-700">RecruiterRAG</h1>
          <p className="text-xs text-slate-400">Local AI recruiting</p>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-tour={item.tour}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
              {item.to === '/training' && <TrainingBadge />}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button
            onClick={() => setHelpOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <span aria-hidden>❓</span> Help
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/positions" element={<PositionList />} />
            <Route path="/positions/new" element={<NewPositionWizard />} />
            <Route path="/positions/:id" element={<PositionDetail />} />
            <Route path="/candidates" element={<CandidateList />} />
            <Route path="/candidates/add" element={<CandidateIngestionWizard />} />
            <Route path="/candidates/:id" element={<CandidateDetail />} />
            <Route path="/training" element={<PostTraining />} />
            <Route path="/training/new" element={<PostTrainingWizard />} />
            <Route path="/training/compare" element={<AdapterComparison />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <WelcomeModal
        open={Boolean(showWelcome)}
        onStartTour={() => {
          onboardingMutation.mutate();
          startTour();
        }}
        onSkip={() => onboardingMutation.mutate()}
      />
      <GuidedTour />
      <HelpSidebar open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
