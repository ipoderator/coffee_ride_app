'use client';

import { useState, type FormEvent } from 'react';
import { createReviewRequestSchema, type Review } from 'types';
import { Button, Card, FormField, REVIEWS_TERMS, Textarea } from 'ui';
import { ApiError, createReview } from '../api';

const RATING_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * `/rides/[id]`'s review submission form (CR-042, `docs/design.md` §9 `ReviewForm`).
 * `RideDetailView` renders this only when the viewer is eligible and hasn't already
 * reviewed (`viewerHasReviewed`) — there is no separate "you can't review" message
 * here, the absence of the form already communicates that
 * (`.claude/context/current-task.md`'s scope decision).
 *
 * No shared 1-5 rating picker exists in `packages/ui` yet (only the read-only
 * `DifficultyScale`) — this is feature-local, same "don't invent a shared component
 * for one call site" precedent `.claude/rules/extensibility.md` implies.
 */
export function ReviewForm({
  rideId,
  onSubmitted,
}: {
  rideId: string;
  onSubmitted: (review: Review) => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const payload = {
      rating: rating ?? 0,
      comment: comment.trim().length > 0 ? comment.trim() : null,
    };
    const parsed = createReviewRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setRatingError(
        parsed.error.issues.find((issue) => issue.path[0] === 'rating')
          ?.message ?? null,
      );
      setFormError(null);
      return;
    }

    setRatingError(null);
    setFormError(null);
    setSuccessMessage(null);
    setIsPending(true);
    try {
      const response = await createReview(rideId, parsed.data);
      setSuccessMessage(REVIEWS_TERMS.submitSuccess);
      onSubmitted(response.review);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.problem.code === 'validation_error' &&
        error.problem.errors
      ) {
        setRatingError(
          error.problem.errors.find((issue) => issue.path === 'rating')
            ?.message ?? null,
        );
      } else {
        setFormError(REVIEWS_TERMS.submitError);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span
            id="review-rating-label"
            className="text-sm font-medium text-text"
          >
            {REVIEWS_TERMS.ratingLabel}
          </span>
          <div
            role="radiogroup"
            aria-labelledby="review-rating-label"
            className="flex gap-2"
          >
            {RATING_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} из 5`}
                disabled={isPending}
                onClick={() => setRating(value)}
                className={
                  'flex h-11 w-11 items-center justify-center rounded-lg border text-base font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (rating !== null && value <= rating
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border-input bg-bg-raised text-text')
                }
              >
                {value}
              </button>
            ))}
          </div>
          {ratingError && (
            <p role="alert" className="text-sm text-danger">
              {ratingError}
            </p>
          )}
        </div>

        <FormField id="review-comment" label={REVIEWS_TERMS.commentLabel}>
          <Textarea
            value={comment}
            placeholder={REVIEWS_TERMS.commentPlaceholder}
            onChange={(event) => setComment(event.target.value)}
            disabled={isPending}
          />
        </FormField>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        {successMessage && !formError && (
          <p role="status" className="text-sm text-success">
            {successMessage}
          </p>
        )}

        <Button type="submit" isLoading={isPending} className="self-start">
          {isPending ? REVIEWS_TERMS.submitPending : REVIEWS_TERMS.submit}
        </Button>
      </form>
    </Card>
  );
}
