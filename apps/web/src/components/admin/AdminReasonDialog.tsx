'use client';

import { useId, useState, type FormEvent } from 'react';
import { ADMIN_TERMS, Button, Dialog, FormField, Textarea } from 'ui';

const REASON_MAX_LENGTH = 500;

/** One fact naming the record the action applies to — `label` is optional
 * (a rating line reads on its own). */
export interface AdminReasonSubjectLine {
  label?: string;
  value: string;
  muted?: boolean;
}

export interface AdminReasonDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  /** CR-232: the exact record (email, ride title, review) — part of the
   * dialog's accessible description, so it is announced with the title. */
  subject: ReadonlyArray<AdminReasonSubjectLine>;
  /** CR-232: who will see the reason — required, so no action inherits a
   * privacy promise that is wrong for it (a ride's hide reason reaches its
   * organizer). */
  reasonHint: string;
  confirmLabel: string;
  /** Sends the action with the trimmed reason. Resolves to an error line to
   * show inside the dialog (it stays open), or `null` on success — the dialog
   * then closes itself. */
  onSubmit: (reason: string) => Promise<string | null>;
}

/**
 * CR-231 (ADR-032): block, hide and cancel all need a reason, stored in the
 * action log. The form lives in `children` rather than `Dialog`'s `footer`, so
 * Enter in the field and the confirm button submit the same `<form>`. It only
 * mounts while open, so every opening starts with an empty field.
 *
 * CR-232: in a long list it was easy to confirm against the wrong row, so the
 * dialog names its record under the description. Long unbroken values
 * (emails, titles) wrap anywhere instead of scrolling sideways.
 */
export function AdminReasonDialog({
  open,
  onClose,
  title,
  description,
  subject,
  reasonHint,
  confirmLabel,
  onSubmit,
}: AdminReasonDialogProps) {
  // Lifted from the form: while the action is in flight, Escape and the
  // backdrop must not close the dialog — the request would still land and
  // its late `onClose` would shut whatever dialog the admin opened next.
  const [isSubmitting, setIsSubmitting] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={isSubmitting ? ignoreClose : onClose}
      title={title}
      description={
        <>
          <p>{description}</p>
          <div className="mt-3 flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-bg-raised p-3">
            {subject.map((line, index) => (
              <div key={index} className="flex min-w-0 flex-col gap-0.5">
                {line.label ? (
                  <p className="text-body-sm text-text-secondary">
                    {line.label}
                  </p>
                ) : null}
                <p
                  className={
                    line.muted
                      ? 'wrap-anywhere text-body text-text-muted'
                      : 'wrap-anywhere text-body font-medium text-text'
                  }
                >
                  {line.value}
                </p>
              </div>
            ))}
          </div>
        </>
      }
    >
      {open ? (
        <ReasonForm
          reasonHint={reasonHint}
          confirmLabel={confirmLabel}
          onClose={onClose}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          setIsSubmitting={setIsSubmitting}
        />
      ) : null}
    </Dialog>
  );
}

function ReasonForm({
  reasonHint,
  confirmLabel,
  onClose,
  onSubmit,
  isSubmitting,
  setIsSubmitting,
}: Pick<
  AdminReasonDialogProps,
  'reasonHint' | 'confirmLabel' | 'onClose' | 'onSubmit'
> & {
  isSubmitting: boolean;
  setIsSubmitting: (value: boolean) => void;
}) {
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setFieldError(ADMIN_TERMS.reasonRequired);
      return;
    }
    setFieldError(undefined);
    setFormError(null);
    setIsSubmitting(true);
    const error = await onSubmit(trimmed);
    setIsSubmitting(false);
    if (error === null) {
      onClose();
      return;
    }
    setFormError(error);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="mt-4 flex flex-col gap-4"
    >
      <FormField
        id={fieldId}
        label={ADMIN_TERMS.reasonLabel}
        hint={reasonHint}
        error={fieldError}
      >
        <Textarea
          rows={3}
          maxLength={REASON_MAX_LENGTH}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </FormField>
      {formError ? (
        <p role="alert" className="text-body-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          {ADMIN_TERMS.cancel}
        </Button>
        <Button type="submit" variant="danger-filled" isLoading={isSubmitting}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

function ignoreClose() {}
