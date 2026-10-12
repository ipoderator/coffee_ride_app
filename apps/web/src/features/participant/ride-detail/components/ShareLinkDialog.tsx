'use client';

import { useId, useState } from 'react';
import { Button, Dialog, Input, RIDE_POSTER_TERMS, useToast } from 'ui';
import { copyText } from '../lib/share';

const T = RIDE_POSTER_TERMS;

/**
 * CR-242: the last step of «Поделиться» — neither the share sheet nor any
 * clipboard path worked, so the link itself is shown, selected on focus, with
 * one more try at copying. Never a dead end.
 */
export function ShareLinkDialog({
  url,
  open,
  onClose,
}: {
  url: string;
  open: boolean;
  onClose: () => void;
}) {
  const fieldId = useId();
  const { showToast } = useToast();
  const [copyFailed, setCopyFailed] = useState(false);

  function close() {
    setCopyFailed(false);
    onClose();
  }

  async function retryCopy() {
    if (await copyText(url)) {
      close();
      showToast(T.shareCopied);
    } else {
      setCopyFailed(true);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={T.shareManualTitle}
      description={T.shareManualDescription}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {T.shareManualClose}
          </Button>
          <Button onClick={() => void retryCopy()}>{T.shareManualCopy}</Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-body-sm font-medium text-text">
          {T.shareManualFieldLabel}
        </label>
        <Input
          id={fieldId}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        {copyFailed && (
          <p role="alert" className="text-body-sm text-danger">
            {T.shareFailed}
          </p>
        )}
      </div>
    </Dialog>
  );
}
