import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RIDE_STATUS_TERMS } from '../terminology';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the label text for every ride status tone', () => {
    for (const { label } of Object.values(RIDE_STATUS_TERMS)) {
      render(<StatusBadge label={label} tone="neutral" />);
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('composes directly with a terminology term', () => {
    render(<StatusBadge {...RIDE_STATUS_TERMS.cancelled} />);
    expect(screen.getByText('Отменён')).toBeInTheDocument();
  });

  it('is the only tone rendered as a solid fill (docs/design.md §1)', () => {
    const { container: dangerBox } = render(
      <StatusBadge label="Отменён" tone="danger" />,
    );
    const dangerClass = dangerBox.firstElementChild?.className ?? '';
    expect(dangerClass).toContain('bg-danger');
    expect(dangerClass).toContain('text-on-danger');

    for (const tone of ['success', 'warning', 'info'] as const) {
      const { container } = render(<StatusBadge label="Тест" tone={tone} />);
      const className = container.firstElementChild?.className ?? '';
      expect(className).not.toContain('bg-danger');
      // Tinted, not solid: uses the tone at low opacity, never a bare `bg-{tone}`.
      expect(className).toContain(`bg-${tone}/`);
    }

    // `neutral` has no dedicated color token at all (no `--neutral` in tokens.css) —
    // it reuses the same raised-surface/border/secondary-text combination a plain
    // card would, not a tinted color.
    const { container: neutralBox } = render(
      <StatusBadge label="Тест" tone="neutral" />,
    );
    const neutralClass = neutralBox.firstElementChild?.className ?? '';
    expect(neutralClass).not.toContain('bg-danger');
    expect(neutralClass).toContain('bg-bg-raised');
  });

  it('renders a 4px printed-stamp chip, not a pill (ADR-021)', () => {
    const { container } = render(
      <StatusBadge label="Опубликован" tone="success" />,
    );
    expect(container.firstElementChild?.className).toContain('rounded-md');
    expect(container.firstElementChild?.className).not.toContain(
      'rounded-full',
    );
  });
});
