import { render } from '@testing-library/react';
import { RadarRenderer } from './RadarRenderer';

test('mounts a chart container when candidates have scores', () => {
  const { container } = render(
    <RadarRenderer
      data={{
        candidates: [
          { name: 'Alice', scores: [{ dimension: 'Rust', score: 8 }, { dimension: 'Comms', score: 6 }] },
        ],
      }}
    />,
  );
  expect(container.firstChild).not.toBeNull();
});

test('renders nothing when no candidate has scores', () => {
  const { container } = render(<RadarRenderer data={{ candidates: [{ name: 'NoScores' }] }} />);
  expect(container.firstChild).toBeNull();
});
