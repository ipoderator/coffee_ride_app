import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Зарегистрироваться</Button>);
    expect(
      screen.getByRole('button', { name: 'Зарегистрироваться' }),
    ).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Отправить</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('disables and marks itself busy when isLoading, without the caller passing disabled', () => {
    render(<Button isLoading>Отправить</Button>);
    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  // ADR-024: a busy button also shows a visible spinner, not just the
  // cursor/disabled state — that was easy to miss.
  it('shows a visible spinner when isLoading', () => {
    render(<Button isLoading>Отправить</Button>);
    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button.querySelector('.animate-spin')).not.toBeNull();
  });

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Отмена</Button>);
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  // ADR-021 («Топокарта»): an in-page destructive action is an outline; the
  // red fill belongs to the confirmation step only.
  it('renders `danger` as a danger outline with danger text, not a fill', () => {
    render(<Button variant="danger">Удалить</Button>);
    const button = screen.getByRole('button', { name: 'Удалить' });
    expect(button.className).toContain('border-danger');
    expect(button.className).toContain('text-danger');
    expect(button.className).not.toMatch(/(^|\s)bg-danger(\s|$)/);
  });

  it('renders `danger-filled` as a solid danger fill', () => {
    render(<Button variant="danger-filled">Отменить регистрацию</Button>);
    const button = screen.getByRole('button', { name: 'Отменить регистрацию' });
    expect(button.className).toMatch(/(^|\s)bg-danger(\s|$)/);
    expect(button.className).toContain('text-on-danger');
  });

  it('renders `secondary` as an ink outline with no fill of its own', () => {
    render(<Button variant="secondary">Отмена</Button>);
    const button = screen.getByRole('button', { name: 'Отмена' });
    expect(button.className).toContain('border-frame');
    expect(button.className).toContain('bg-transparent');
  });
});
