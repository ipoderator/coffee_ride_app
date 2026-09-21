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

    expect(screen.queryByText('Регистрация отменена.')).not.toBeInTheDocument();
  });

  it('useToast without a ToastProvider ancestor fails soft, not throws', () => {
    expect(() =>
      render(<ShowToastButton message="Вы в списке ожидания." />),
    ).not.toThrow();
    fireEvent.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.queryByText('Вы в списке ожидания.')).not.toBeInTheDocument();
  });
});
