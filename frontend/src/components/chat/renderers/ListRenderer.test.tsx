import { render, screen } from '@testing-library/react';
import { ListRenderer } from './ListRenderer';

test('renders ranked candidates with scores and stages', () => {
  render(
    <ListRenderer
      data={{
        candidates: [
          { name: 'Alice', fit_score: 9.2, stage: 'Screening' },
          { name: 'Bob', fit_score: 6.1 },
        ],
      }}
    />,
  );
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByText('9.2/10')).toBeTruthy();
  expect(screen.getByText('Screening')).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy(); // rank badge
});

test('renders nothing without candidates', () => {
  const { container } = render(<ListRenderer data={{}} />);
  expect(container.firstChild).toBeNull();
});
