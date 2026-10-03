import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENGLISH_API_TEXTS,
  englishProblem,
  expectNoEnglishApiText,
} from '@/test-support/english-problem';
import { ReviewForm } from './components/ReviewForm';
import { createReview } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, createReview: vi.fn() };
});

const createReviewMock = vi.mocked(createReview);

function renderForm() {
  return render(<ReviewForm rideId="ride-1" onSubmitted={vi.fn()} />);
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Оставить отзыв' }));
}

describe('ReviewForm validation lines (CR-194)', () => {
  beforeEach(() => {
    createReviewMock.mockReset();
  });

  it('asks for a rating in Russian when no star is picked', async () => {
    renderForm();

    submit();

    expect(
      await screen.findByText('Поставьте оценку от 1 до 5.'),
    ).toBeInTheDocument();
    expectNoEnglishApiText();
    expect(createReviewMock).not.toHaveBeenCalled();
  });

  // Regression: a comment past the 2 000-character bound used to fail the
  // client schema with nothing on screen — the submit looked dead.
  it('says a too long comment is too long instead of doing nothing', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('radio', { name: '5 из 5' }));
    fireEvent.change(screen.getByLabelText('Комментарий'), {
      target: { value: 'x'.repeat(2001) },
    });
    submit();

    const error = await screen.findByText(/^Не длиннее 2.000 символов\.$/);
    expect(screen.getByLabelText('Комментарий')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Комментарий')).toHaveAccessibleDescription(
      error.textContent ?? '',
    );
    expect(
      screen.queryByText(ENGLISH_API_TEXTS.comment),
    ).not.toBeInTheDocument();
    expect(createReviewMock).not.toHaveBeenCalled();
  });

  it('shows Russian for a server field error and keeps the API’s English off the screen', async () => {
    createReviewMock.mockRejectedValue(
      englishProblem('validation_error', {
        status: 400,
        fields: ['rating', 'comment'],
      }),
    );
    renderForm();

    fireEvent.click(screen.getByRole('radio', { name: '4 из 5' }));
    submit();

    expect(
      await screen.findByText('Поставьте оценку от 1 до 5.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Проверьте это поле.')).toBeInTheDocument();
    expectNoEnglishApiText();
  });

  it('shows the generic Russian line for a code it does not know', async () => {
    createReviewMock.mockRejectedValue(
      englishProblem('some_new_server_code', { status: 500 }),
    );
    renderForm();

    fireEvent.click(screen.getByRole('radio', { name: '4 из 5' }));
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить отзыв. Попробуйте ещё раз.',
    );
    expectNoEnglishApiText();
  });

  it('does not stay silent when the server rejects something that is neither field', async () => {
    createReviewMock.mockRejectedValue(
      englishProblem('validation_error', { status: 400, fields: ['extra'] }),
    );
    renderForm();

    fireEvent.click(screen.getByRole('radio', { name: '4 из 5' }));
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось отправить отзыв. Попробуйте ещё раз.',
    );
    expectNoEnglishApiText();
  });
});
