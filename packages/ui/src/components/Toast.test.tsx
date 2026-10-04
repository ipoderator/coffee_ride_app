import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function ShowToastButton({ message }: { message: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      Показать
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a toast message when showToast is called', () => {
    render(
      <ToastProvider>
        <ShowToastButton message="Вы зарегистрированы на заезд." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));

    expect(
      screen.getByText('Вы зарегистрированы на заезд.'),
    ).toBeInTheDocument();
  });

  it('auto-dismisses a toast after the timeout', () => {
    render(
      <ToastProvider>
        <ShowToastButton message="Регистрация отменена." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.getByText('Регистрация отменена.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    // CR-170: it fades out first, then leaves the DOM.
    expect(
      screen.getByText('Регистрация отменена.').parentElement!.className,
    ).toContain('motion-safe:animate-fade-out');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByText('Регистрация отменена.')).not.toBeInTheDocument();
  });

  it('rises in and draws a check mark for a success, not for other tones (CR-170)', () => {
    function ShowBoth() {
      const { showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast('Готово.')}>
            Успех
          </button>
          <button type="button" onClick={() => showToast('Сбой.', 'danger')}>
            Ошибка
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <ShowBoth />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Успех' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка' }));

    const success = screen.getByText('Готово.').parentElement!;
    expect(success.className).toContain('motion-safe:animate-rise-in');
    const mark = success.querySelector('[data-toast-mark]');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark!.querySelector('path')!.getAttribute('class')).toContain(
      'motion-safe:animate-check-draw',
    );
    expect(
      screen
        .getByText('Сбой.')
        .parentElement!.querySelector('[data-toast-mark]'),
    ).toBeNull();
  });

  it('clears a pending auto-dismiss timer on unmount (CR-207)', () => {
    const { unmount } = render(
      <ToastProvider>
        <ShowToastButton message="Заезд опубликован." />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    unmount();

    // Before CR-207 both timers survived the unmount and their `setToasts`
    // ran against a gone provider — under jsdom that surfaced as an uncaught
    // `ReferenceError: window is not defined` once the environment was torn
    // down, failing the whole run even though every test passed.
    expect(vi.getTimerCount()).toBe(0);
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(4000 + 200);
      }),
    ).not.toThrow();
  });

  it('useToast without a ToastProvider ancestor fails soft, not throws', () => {
    expect(() =>
      render(<ShowToastButton message="Вы в списке ожидания." />),
    ).not.toThrow();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.queryByText('Вы в списке ожидания.')).not.toBeInTheDocument();
  });
});
