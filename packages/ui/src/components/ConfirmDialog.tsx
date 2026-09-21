'use client';

import { Button, type ButtonVariant } from './Button';
import { Dialog } from './Dialog';

// CR-103: the destructive-action-specific wrapper around `Dialog` —
// `RegistrationButton`'s cancel-registration/leave-waitlist actions are the first
// callers. Deliberately thin: every prop maps 1:1 onto `Dialog` plus two buttons, no
// behavior of its own beyond wiring `onConfirm`/`onClose` to `Button`'s existing
// variants (`.claude/rules/extensibility.md` — no new `Button` variant needed).
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Duplicate-submit protection while the confirmed action is in flight — disables
   * both buttons and swaps the confirm button into `Button`'s own busy state, same
   * precedent as every other in-flight action in this codebase. */
  isConfirming?: boolean;
  /** `danger` (default): the two current call sites (cancel registration, leave
   * waitlist) both remove the viewer from something. `primary` is available for a
   * future non-destructive confirmation. */
  confirmVariant?: Extract<ButtonVariant, 'primary' | 'danger'>;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  confirmVariant = 'danger',
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            isLoading={isConfirming}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
