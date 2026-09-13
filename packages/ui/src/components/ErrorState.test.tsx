import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('renders a plain-language message', () => {
    render(<ErrorState message="Не удалось загрузить заезды." />);
    expect(
      screen.getByText('Не удалось загрузить заезды.'),
    ).toBeInTheDocument();
  });

  it('renders an optional title above the message', () => {
    render(
      <ErrorState
        title="Что-то пошло не так"
        message="Не удалось загрузить заезды."
      />,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
  });

  it('renders no retry button when onRetry is omitted', () => {
    render(<ErrorState message="Не удалось загрузить заезды." />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a retry button using the shared UI_TERMS.retry default label, and fires the callback', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState message="Не удалось загрузить заезды." onRetry={onRetry} />,
    );
    const button = screen.getByRole('button', { name: 'Повторить' });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('accepts a custom retry label', () => {
    render(
      <ErrorState
        message="Не удалось загрузить заезды."
        onRetry={() => {}}
        retryLabel="Попробовать снова"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Попробовать снова' }),
    ).toBeInTheDocument();
  });

  it('defaults to an assertive full failure: tone=danger, variant=block, role=alert', () => {
    render(<ErrorState message="Не удалось загрузить заезды." />);
    const region = screen.getByRole('alert');
    expect(region.className).toContain('bg-danger/10');
  });

  it('renders the degraded-state pattern as a non-interrupting inline notice: tone=warning, variant=inline, role=status', () => {
    render(
      <ErrorState
        message="Карта временно недоступна."
        tone="warning"
        variant="inline"
      />,
    );
    const region = screen.getByRole('status');
    expect(region.className).toContain('bg-warning/10');
    expect(region.className).not.toContain('py-12');
  });

  it('never renders role=alert for an inline degraded notice, even if tone=danger', () => {
    render(
      <ErrorState
        message="Загрузка недоступна."
        tone="danger"
        variant="inline"
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
