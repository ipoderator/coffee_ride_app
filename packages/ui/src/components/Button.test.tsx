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

  it('defaults to type="button" so it never accidentally submits a form', () => {
    render(<Button>Отмена</Button>);
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveAttribute(
      'type',
      'button',
    );
  });
});
