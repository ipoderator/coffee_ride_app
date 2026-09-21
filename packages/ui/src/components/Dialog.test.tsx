import { fireEvent, render, screen } from '@testing-library/react';
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
});
