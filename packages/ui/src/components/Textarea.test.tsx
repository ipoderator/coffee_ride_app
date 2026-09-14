import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('forwards standard textarea props', () => {
    render(<Textarea placeholder="Расскажите о себе" defaultValue="" />);
    expect(
      screen.getByPlaceholderText('Расскажите о себе'),
    ).toBeInTheDocument();
  });

  it('defaults to 4 rows but accepts an override', () => {
    const { rerender } = render(<Textarea data-testid="field" />);
    expect(screen.getByTestId('field')).toHaveAttribute('rows', '4');

    rerender(<Textarea data-testid="field" rows={8} />);
    expect(screen.getByTestId('field')).toHaveAttribute('rows', '8');
  });

  it('reflects aria-invalid when set', () => {
    render(<Textarea aria-invalid data-testid="field" />);
    expect(screen.getByTestId('field')).toHaveAttribute('aria-invalid', 'true');
  });
});
