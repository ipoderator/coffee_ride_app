'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createRideUpdateRequestSchema, type RideUpdate } from 'types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  RIDE_UPDATES_TERMS,
  Skeleton,
  Textarea,
  formatDate,
  formatTime,
} from 'ui';
import { ApiError, createRideUpdate, getRideUpdates } from '../api';

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * `/organizer/rides/[id]/updates` (CR-039, `docs/design.md` §8/§9). Compose a new
 * update (fans out a notification to every active registrant server-side) plus a
 * read-only history of previously sent updates, newest first. No edit/delete —
 * `.claude/context/current-task.md`'s scope decision. Same duplicate-submit-
 * protection/server-error-mapping discipline every other form in this repo uses
 * (`.claude/rules/frontend.md`).
 */
export function UpdateComposer({ rideId }: { rideId: string }) {
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [historyStatus, setHistoryStatus] = useState<LoadStatus>('loading');
  const [items, setItems] = useState<RideUpdate[]>([]);

  function loadHistory() {
    setHistoryStatus('loading');
    getRideUpdates(rideId)
      .then((response) => {
        setItems(response.items);
        setHistoryStatus('ready');
      })
      .catch(() => {
        setHistoryStatus('error');
      });
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;

    setFieldError(null);
    setFormError(null);
    setSuccessMessage(null);

    const parsed = createRideUpdateRequestSchema.safeParse({ message });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? null);
      return;
    }

    setIsSending(true);
    try {
      await createRideUpdate(rideId, parsed.data.message);
      setMessage('');
      setSuccessMessage(RIDE_UPDATES_TERMS.sendSuccess);
      loadHistory();
    } catch (err) {
      if (err instanceof ApiError) {
        const messageIssue = err.problem.errors?.find(
          (issue) => issue.path === 'message',
        );
        setFieldError(messageIssue?.message ?? null);
        setFormError(messageIssue ? null : err.problem.detail);
      } else {
        setFormError(RIDE_UPDATES_TERMS.historyLoadError);
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <FormField
            id="ride-update-message"
            label={RIDE_UPDATES_TERMS.messageLabel}
            error={fieldError ?? undefined}
          >
            <Textarea
              value={message}
              placeholder={RIDE_UPDATES_TERMS.messagePlaceholder}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSending}
            />
          </FormField>

          {formError && <p className="text-sm text-danger">{formError}</p>}
          {successMessage && (
            <p role="status" className="text-sm text-success">
              {successMessage}
            </p>
          )}

          <Button type="submit" disabled={isSending}>
            {isSending
              ? RIDE_UPDATES_TERMS.sendPending
              : RIDE_UPDATES_TERMS.send}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        <p className="text-sm font-medium text-text">
          {RIDE_UPDATES_TERMS.historyTitle}
        </p>

        {historyStatus === 'loading' && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {historyStatus === 'error' && (
          <ErrorState message={RIDE_UPDATES_TERMS.historyLoadError} />
        )}

        {historyStatus === 'ready' && items.length === 0 && (
          <EmptyState
            title={RIDE_UPDATES_TERMS.historyEmptyTitle}
            description={RIDE_UPDATES_TERMS.historyEmptyDescription}
          />
        )}

        {historyStatus === 'ready' && items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const createdAt = new Date(item.createdAt);
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 border-b border-border pb-3 last:border-none last:pb-0"
                >
                  <p className="text-sm text-text">{item.message}</p>
                  <p className="text-xs text-text-secondary">
                    {formatDate(createdAt)} {formatTime(createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
