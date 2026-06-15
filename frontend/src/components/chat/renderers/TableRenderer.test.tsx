import { render, screen } from '@testing-library/react';
import { TableRenderer } from './TableRenderer';

test('renders columns and rows', () => {
  render(
    <TableRenderer
      data={{
        table: {
          columns: ['Candidate', 'System Design'],
          rows: [
            ['Alice', 9],
            ['Bob', 5],
          ],
        },
      }}
    />,
  );
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.getByText('System Design')).toBeTruthy();
  expect(screen.getByText('Alice')).toBeTruthy();
  expect(screen.getByText('5')).toBeTruthy();
});

test('renders nothing without table data', () => {
  const { container } = render(<TableRenderer data={{}} />);
  expect(container.firstChild).toBeNull();
});
