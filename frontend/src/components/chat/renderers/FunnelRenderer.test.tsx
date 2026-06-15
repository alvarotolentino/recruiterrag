import { render, screen } from '@testing-library/react';
import { FunnelRenderer } from './FunnelRenderer';

test('renders one bar per stage with counts', () => {
  render(
    <FunnelRenderer
      data={{ funnel: [{ stage: 'New', count: 5 }, { stage: 'Screening', count: 2 }] }}
    />,
  );
  expect(screen.getByText('New')).toBeTruthy();
  expect(screen.getByText('Screening')).toBeTruthy();
  expect(screen.getByText('5')).toBeTruthy();
});

test('renders nothing for empty funnel', () => {
  const { container } = render(<FunnelRenderer data={{}} />);
  expect(container.firstChild).toBeNull();
});
