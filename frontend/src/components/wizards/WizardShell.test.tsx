import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { WizardShell } from './WizardShell';

const baseProps = {
  title: 'Test Wizard',
  steps: ['One', 'Two', 'Three'],
  currentStep: 1,
  canGoNext: true,
  onBack: vi.fn(),
  onNext: vi.fn(),
};

test('renders step indicator and children', () => {
  render(<WizardShell {...baseProps}>content here</WizardShell>);
  expect(screen.getByText('Test Wizard')).toBeTruthy();
  expect(screen.getByText('content here')).toBeTruthy();
});

test('next button calls onNext', async () => {
  const onNext = vi.fn();
  render(
    <WizardShell {...baseProps} onNext={onNext}>
      x
    </WizardShell>,
  );
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(onNext).toHaveBeenCalled();
});

test('next button disabled when step invalid', () => {
  render(
    <WizardShell {...baseProps} canGoNext={false}>
      x
    </WizardShell>,
  );
  expect(screen.getByRole('button', { name: /next/i })).toHaveProperty('disabled', true);
});

test('back button disabled on first step', () => {
  render(
    <WizardShell {...baseProps} currentStep={0}>
      x
    </WizardShell>,
  );
  expect(screen.getByRole('button', { name: /back/i })).toHaveProperty('disabled', true);
});
