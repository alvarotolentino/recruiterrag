import Joyride, { STATUS, type CallBackProps, type Step } from 'react-joyride';
import { useOnboardingStore } from '../../store/onboardingStore';

// Guided tour — anchored to the dashboard + nav (always-mounted targets).
const STEPS: Step[] = [
  {
    target: '[data-tour="dashboard"]',
    content: 'This is your home base. Everything about your open job pipelines lives here.',
    disableBeacon: true,
    placement: 'center',
  },
  {
    target: '[data-tour="kpis"]',
    content:
      "Your key numbers at a glance — average fit score, how many candidates are strong fits, who's reached an offer, and who advanced this week.",
  },
  {
    target: '[data-tour="overview-tiles"]',
    content:
      'Three live summaries — your pipelines, your candidates, and how they move through the stages. Switch between this week, month, or year with the buttons up top.',
    placement: 'top',
  },
  {
    target: '[data-tour="progress-chart"]',
    content:
      'See how long candidates sit in each stage for every open pipeline. Stages that take many days are where things stall — solid markers mean someone is still waiting there.',
    placement: 'top',
  },
  {
    target: '[data-tour="open-pipelines"]',
    content:
      'Each open pipeline shows a colored chip and mini-funnel for every stage, so you can see where candidates are and where they drop off.',
    placement: 'top',
  },
  {
    target: '[data-tour="new-position"]',
    content:
      'Start here — paste a job description. The AI extracts the scoring dimensions and a target score for each one. You can edit them anytime.',
  },
  {
    target: '[data-tour="nav-positions"]',
    content:
      "Open a position to rank candidates, drag them across stages, add interview notes per stage, and re-score with those notes. The floating chat answers questions like 'Who are the top 3?'",
  },
  {
    target: '[data-tour="nav-candidates"]',
    content: 'Your talent pool. Add resumes here — the AI reads, extracts the work history, and scores them automatically.',
  },
  {
    target: '[data-tour="nav-training"]',
    content: "Once you've closed a few pipelines, you can teach the AI your preferences. We'll guide you step by step.",
  },
];

export function GuidedTour() {
  const tourRunning = useOnboardingStore((s) => s.tourRunning);
  const stopTour = useOnboardingStore((s) => s.stopTour);

  const handleCallback = (data: CallBackProps) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      stopTour();
    }
  };

  return (
    <Joyride
      steps={STEPS}
      run={tourRunning}
      continuous
      showSkipButton
      showProgress
      disableScrolling
      callback={handleCallback}
      styles={{ options: { primaryColor: '#2563eb', zIndex: 100 } }}
      locale={{ last: 'Done', skip: 'Skip tour' }}
    />
  );
}
