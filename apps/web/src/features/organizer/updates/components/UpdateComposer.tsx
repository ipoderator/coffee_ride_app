'use client';

import { Send } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { createRideUpdateRequestSchema, type RideUpdate } from 'types';
import {
  AUTH_TERMS,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Notice,
  RIDE_UPDATES_TERMS,
  Skeleton,
  Textarea,
  formatDate,
  formatTime,
} from 'ui';
import { useRideWorkspace } from '@/lib/cabinet/ride-workspace';
import { ApiError, createRideUpdate, getRideUpdates } from '../api';
import {
  fieldErrorMessage,
  serverFieldErrorMessage,
} from '@/lib/forms/field-errors';

type LoadStatus = 'loading' | 'ready' | 'error';

const MESSAGE_MAX_LENGTH = 2000;

/** The shared schema's messages are English; the form speaks Russian. `null`
 * when the text breaks neither known rule (only the server knows why). */
function messageError(message: string): string | null {
  const length = message.trim().length;
  if (length === 0) return RIDE_UPDATES_TERMS.messageRequired;
  if (length > MESSAGE_MAX_LENGTH) return RIDE_UPDATES_TERMS.messageTooLong;
  return null;
}

/**
 * `/organizer/rides/[id]/updates` (CR-039, `docs/design.md` §8/§9). Compose a new
 * update (fans out a notification to every active registrant server-side) plus a
 * read-only history of previously sent updates, newest first. No edit/delete —
 * `.claude/context/current-task.md`'s scope decision. Same duplicate-submit-
 * protection/server-error-mapping discipline every other form in this repo uses
 * (`.claude/rules/frontend.md`).
 *
 * CR-187: who will receive it, a live «Так увидят участники» preview, Russian
 * validation next to the field. Inside the ride workspace: the recipient count
 * and the ride's timezone come from it, a sent update refreshes its «последнее
 * обновление» line, and a draft (nobody can be registered yet, so nobody would
 * receive it) gets an explanation instead of the composer.
 */
export function UpdateComposer({ rideId }: { rideId: string }) {
  const workspace = useRideWorkspace();
  const ride = workspace?.data.ride;
  const timeZone = ride?.startTimezone;
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
      setFieldError(
        messageError(message) ??
          (parsed.error.issues[0]
            ? fieldErrorMessage(parsed.error.issues[0])
            : null),
      );
      return;
    }

    setIsSending(true);
    try {
      await createRideUpdate(rideId, parsed.data.message);
      setMessage('');
      setSuccessMessage(RIDE_UPDATES_TERMS.sendSuccess);
      loadHistory();
      void workspace?.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const messageIssue = err.problem.errors?.find(
          (issue) => issue.path === 'message',
        );
        setFieldError(
          messageIssue
            ? (messageError(message) ?? serverFieldErrorMessage())
            : null,
        );
        setFormError(messageIssue ? null : AUTH_TERMS.genericError);
      } else {
        setFormError(RIDE_UPDATES_TERMS.historyLoadError);
      }
    } finally {
      setIsSending(false);
    }
  }

  const trimmed = message.trim();

  return (
    <div className="flex flex-col gap-6">
      {ride?.status === 'draft' ? (
        <Notice
          title={RIDE_UPDATES_TERMS.draftNoticeTitle}
          icon={<Send className="size-5" />}
        >
          {RIDE_UPDATES_TERMS.draftNoticeText}
        </Notice>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(15rem,1fr)]">
          <Card>
            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4"
            >
              <FormField
                id="ride-update-message"
                label={RIDE_UPDATES_TERMS.messageLabel}
                hint={
                  workspace
                    ? RIDE_UPDATES_TERMS.recipients(
                        workspace.data.registrationsCount,
                      )
                    : undefined
                }
                error={fieldError ?? undefined}
              >
                <Textarea
                  value={message}
                  placeholder={RIDE_UPDATES_TERMS.messagePlaceholder}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    // Typing answers «Напишите сообщение.»; the recipients
                    // line comes back.
                    setFieldError(null);
                  }}
                  disabled={isSending}
                />
              </FormField>

              {formError && (
                <p role="alert" className="text-body-sm text-danger">
                  {formError}
                </p>
              )}
              {successMessage && (
                <p role="status" className="text-body-sm text-success">
                  {successMessage}
                </p>
              )}

              <Button type="submit" disabled={isSending} className="self-start">
                {isSending
                  ? RIDE_UPDATES_TERMS.sendPending
                  : RIDE_UPDATES_TERMS.send}
              </Button>
            </form>
          </Card>

          <aside
            aria-label={RIDE_UPDATES_TERMS.previewTitle}
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-body-sm font-semibold text-text">
              {RIDE_UPDATES_TERMS.previewTitle}
            </p>
            <p
              className={
                trimmed
                  ? 'whitespace-pre-line text-body text-text wrap-anywhere'
                  : 'text-body-sm text-text-muted'
              }
            >
              {trimmed || RIDE_UPDATES_TERMS.previewEmpty}
            </p>
            {ride && (
              <p className="text-body-sm text-text-secondary wrap-anywhere">
                {ride.title}
              </p>
            )}
          </aside>
        </div>
      )}

      <Card className="flex flex-col gap-4">
        <h3 className="text-h3 text-text">{RIDE_UPDATES_TERMS.historyTitle}</h3>

        {historyStatus === 'loading' && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {historyStatus === 'error' && (
          <ErrorState
            message={RIDE_UPDATES_TERMS.historyLoadError}
            onRetry={loadHistory}
          />
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
                  <p className="whitespace-pre-line text-body text-text wrap-anywhere">
                    {item.message}
                  </p>
                  <p className="font-mono text-body-sm text-text-secondary tabular-nums">
                    {formatDate(createdAt, { timeZone })}{' '}
                    {formatTime(createdAt, { timeZone })}
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
