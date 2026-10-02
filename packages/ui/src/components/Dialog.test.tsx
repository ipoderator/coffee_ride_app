import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Заголовок">
        Содержимое
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, description, and children when open', () => {
    render(
      <Dialog open onClose={() => {}} title="Заголовок" description="Описание">
        Содержимое
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Содержимое')).toBeInTheDocument();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Заголовок">
        Содержимое
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Заголовок">
        Содержимое
      </Dialog>,
    );
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders footer content', () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        title="Заголовок"
        footer={<button type="button">Действие</button>}
      >
        Содержимое
      </Dialog>,
    );
    expect(
      screen.getByRole('button', { name: 'Действие' }),
    ).toBeInTheDocument();
  });

  it('returns focus to the control that opened it once closed (CR-185)', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Открыть
          </button>
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            title="Заголовок"
          />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('leaves focus alone when the opener is gone by the time it closes (CR-185)', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [done, setDone] = useState(false);
      return (
        <>
          {done ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Завершить
            </button>
          )}
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            title="Заголовок"
            footer={
              <button
                type="button"
                onClick={() => {
                  setDone(true);
                  setOpen(false);
                }}
              >
                Подтвердить
              </button>
            }
          />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Завершить' });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(opener);
  });
});
