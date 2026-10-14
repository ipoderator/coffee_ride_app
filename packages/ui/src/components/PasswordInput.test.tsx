import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_TERMS } from '../terminology';
import { FormField } from './FormField';
import { PasswordInput } from './PasswordInput';

describe('PasswordInput (CR-262)', () => {
  it('hides the value until the toggle is pressed, then hides it again', () => {
    render(
      <FormField id="pw" label="Пароль">
        <PasswordInput defaultValue="secret-phrase" />
      </FormField>,
    );

    const input = screen.getByLabelText('Пароль');
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: PASSWORD_TERMS.show }));
    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: PASSWORD_TERMS.hide });
    expect(hide).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(hide);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('keeps FormField wiring on the real input and never submits the form', () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <FormField id="pw" label="Пароль" error="Слишком короткий">
          <PasswordInput />
        </FormField>
      </form>,
    );

    const input = screen.getByLabelText('Пароль');
    expect(input).toHaveAttribute('id', 'pw');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'pw-error');

    fireEvent.click(screen.getByRole('button', { name: PASSWORD_TERMS.show }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the toggle with the field', () => {
    render(<PasswordInput aria-label="Пароль" disabled />);
    expect(
      screen.getByRole('button', { name: PASSWORD_TERMS.show }),
    ).toBeDisabled();
  });
});
