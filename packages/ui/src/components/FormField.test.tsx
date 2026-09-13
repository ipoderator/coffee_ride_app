import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './FormField';
import { Input } from './Input';

describe('FormField', () => {
  it('links the label to the control via a real <label for>', () => {
    render(
      <FormField id="email" label="Email">
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders a hint linked via aria-describedby when there is no error', () => {
    render(
      <FormField id="password" label="Пароль" hint="Минимум 12 символов.">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Пароль');
    const hint = screen.getByText('Минимум 12 символов.');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders an error instead of the hint, linked via aria-describedby, and marks the control invalid', () => {
    render(
      <FormField
        id="email"
        label="Email"
        hint="Мы никому его не покажем."
        error="Введите корректный email."
      >
        <Input />
      </FormField>,
    );
    expect(
      screen.queryByText('Мы никому его не покажем.'),
    ).not.toBeInTheDocument();
    const input = screen.getByLabelText('Email');
    const error = screen.getByText('Введите корректный email.');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(error).toHaveAttribute('role', 'alert');
  });
});
