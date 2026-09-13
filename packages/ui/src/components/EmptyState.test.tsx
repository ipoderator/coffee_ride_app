import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the required explanatory title (never a bare "Нет данных")', () => {
    render(<EmptyState title="Пока нет заездов по этим фильтрам" />);
    expect(
      screen.getByText('Пока нет заездов по этим фильтрам'),
    ).toBeInTheDocument();
  });

  it('renders an optional description', () => {
    render(
      <EmptyState
        title="Пока нет заездов по этим фильтрам"
        description="Попробуйте изменить параметры поиска."
      />,
    );
    expect(
      screen.getByText('Попробуйте изменить параметры поиска.'),
    ).toBeInTheDocument();
  });

  it('renders the offered next action', () => {
    render(
      <EmptyState
        title="Пока нет заездов по этим фильтрам"
        action={<button type="button">Сбросить фильтры</button>}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Сбросить фильтры' }),
    ).toBeInTheDocument();
  });

  it('hides a decorative icon from assistive tech', () => {
    const { container } = render(
      <EmptyState title="Пока нет заездов" icon={<svg data-testid="icon" />} />,
    );
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
    expect(
      iconWrapper?.querySelector('[data-testid="icon"]'),
    ).toBeInTheDocument();
  });

  it('announces itself as a polite status region', () => {
    render(<EmptyState title="Пока нет заездов по этим фильтрам" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
