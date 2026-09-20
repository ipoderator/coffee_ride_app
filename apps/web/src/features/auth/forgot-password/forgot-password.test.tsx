import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { requestPasswordReset } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, requestPasswordReset: vi.fn() };
});

const requestPasswordResetMock = vi.mocked(requestPasswordReset);

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: /Отправить ссылку для сброса|Отправка…/,
    }),
  );
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset();
  });

  it('shows the same success state whether or not the account exists', async () => {
    requestPasswordResetMock.mockResolvedValue(undefined);

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');

    expect(await screen.findByText('Проверьте почту')).toBeInTheDocument();
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: 'rider@example.com',
    });
  });

  it('shows client-side validation without calling the API for an invalid email', async () => {
    render(<ForgotPasswordForm />);
    fillAndSubmit('not-an-email');

    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('ignores a second submit while pending (duplicate-submit protection)', async () => {
    requestPasswordResetMock.mockReturnValue(new Promise(() => {}));

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');
    await screen.findByRole('button', { name: 'Отправка…' });

    fireEvent.submit(
      screen.getByRole('button', { name: 'Отправка…' }).closest('form')!,
    );

    expect(requestPasswordResetMock).toHaveBeenCalledOnce();
  });
});
