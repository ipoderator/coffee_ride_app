import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children', () => {
    render(
      <Card>
        <p>Содержимое карточки</p>
      </Card>,
    );
    expect(screen.getByText('Содержимое карточки')).toBeInTheDocument();
  });

  it('merges a caller-supplied className with its own', () => {
    render(<Card className="custom-class" data-testid="card" />);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('custom-class');
    expect(card).toHaveClass('rounded-xl');
  });
});
