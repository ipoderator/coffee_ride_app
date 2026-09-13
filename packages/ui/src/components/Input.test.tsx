import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('forwards standard input props', () => {
    render(
      <Input placeholder="you@example.com" defaultValue="" type="email" />,
    );
    const input = screen.getByPlaceholderText('you@example.com');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('reflects aria-invalid when set', () => {
    render(<Input aria-invalid data-testid="field" />);
    expect(screen.getByTestId('field')).toHaveAttribute('aria-invalid', 'true');
  });
});
