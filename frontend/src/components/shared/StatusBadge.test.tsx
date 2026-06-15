import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

test('renders known status with friendly label', () => {
  render(<StatusBadge status="closed_filled" />);
  expect(screen.getByText('Filled')).toBeTruthy();
});

test('falls back to raw status for unknown values', () => {
  render(<StatusBadge status="weird_status" />);
  expect(screen.getByText('weird_status')).toBeTruthy();
});
