import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        cancelLabel="Остаться"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        cancelLabel="Остаться"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Отменить регистрацию' }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when the cancel button is clicked, not onConfirm', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        cancelLabel="Остаться"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Остаться' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables both buttons while isConfirming', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        cancelLabel="Остаться"
        isConfirming
      />,
    );
    expect(screen.getByRole('button', { name: 'Остаться' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Отменить регистрацию' }),
    ).toBeDisabled();
  });

  // ADR-021: the confirmation step is the one place a destructive action is
  // filled red; everywhere else `danger` is an outline.
  it('fills the destructive confirm button, while the cancel stays an outline', () => {
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        title="Отменить регистрацию?"
        confirmLabel="Отменить регистрацию"
        cancelLabel="Остаться"
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Отменить регистрацию' }).className,
    ).toMatch(/(^|\s)bg-danger(\s|$)/);
    expect(
      screen.getByRole('button', { name: 'Остаться' }).className,
    ).not.toMatch(/(^|\s)bg-danger(\s|$)/);
  });
});
