'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, Lock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  FileInput,
  Notice,
  RIDE_COVER_TERMS,
  Skeleton,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import { useRideWorkspace } from '@/lib/cabinet/ride-workspace';
import {
  ApiError,
  deleteCoverImage,
  getRideCoverState,
  replaceCoverImage,
  uploadCoverImage,
} from '../api';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizer/rides/[id]/cover` (ADR-019/CR-086, `docs/design.md` §14). Same
 * draft-only gate `RouteUploadForm` uses — download (`GET .../cover`, wired
 * directly into `<Image src>` below) stays available at any status, only
 * upload/replace/delete require `draft`.
 *
 * CR-187: a large preview of the real cover with the file rules beside it; a
 * published ride gets a lock notice instead of controls. Inside the ride
 * workspace, a change also refreshes the workspace's «Обложка» chip.
 */
export function CoverImageUploadForm({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshWorkspace = useRideWorkspace()?.refresh;

  const reload = useCallback(async () => {
    const state = await getRideCoverState(rideId);
    setRideStatus(state.status);
    setCoverImageUrl(state.coverImageUrl);
  }, [rideId]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    reload()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof ApiError &&
          error.problem.code === 'ride_not_found'
        ) {
          setStatus('not-found');
          return;
        }
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [reload, loadAttempt]);

  function resetMessages() {
    setFormError(null);
    setStorageUnavailable(false);
    setSuccessMessage(null);
  }

  function handleUploadError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError(RIDE_COVER_TERMS.loadError);
      return;
    }
    switch (error.problem.code) {
      case 'cover_image_missing':
        setFormError(RIDE_COVER_TERMS.coverImageMissing);
        break;
      case 'cover_image_invalid':
        setFormError(RIDE_COVER_TERMS.coverImageInvalid);
        break;
      case 'cover_image_too_large':
        setFormError(RIDE_COVER_TERMS.coverImageTooLarge);
        break;
      case 'cover_storage_unavailable':
        // `.claude/rules/resilience.md`'s degraded state — an inline warning next to
        // still-usable content, not a hard failure blocking the rest of the screen.
        setStorageUnavailable(true);
        break;
      default:
        setFormError(RIDE_COVER_TERMS.loadError);
    }
  }

  async function handleUpload() {
    if (isPending) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError(RIDE_COVER_TERMS.coverImageMissing);
      return;
    }

    resetMessages();
    setIsPending(true);
    try {
      const isReplace = coverImageUrl !== null;
      const url = isReplace
        ? await replaceCoverImage(rideId, file)
        : await uploadCoverImage(rideId, file);
      // Cache-bust: the server response already points at a fresh S3 key, but
      // the browser/`next/image` may still have the old bytes cached under the
      // same `/v1/rides/:id/cover` path from before this replace.
      setCoverImageUrl(`${url}?v=${Date.now()}`);
      setSuccessMessage(
        isReplace
          ? RIDE_COVER_TERMS.replaceSuccess
          : RIDE_COVER_TERMS.uploadSuccess,
      );
      void refreshWorkspace?.();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      handleUploadError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    if (isPending) return;
    if (!window.confirm(RIDE_COVER_TERMS.deleteConfirm)) return;

    resetMessages();
    setIsPending(true);
    try {
      await deleteCoverImage(rideId);
      setCoverImageUrl(null);
      setSuccessMessage(RIDE_COVER_TERMS.deleteSuccess);
      void refreshWorkspace?.();
    } catch (error) {
      handleUploadError(error);
    } finally {
      setIsPending(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-body-sm font-medium text-text">
          {RIDE_COVER_TERMS.pageTitle}
        </p>
        <Link
          href="/organizer/rides"
          className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
        >
          {RIDE_COVER_TERMS.backToEdit}
        </Link>
      </Card>
    );
  }

  if (status === 'error' || rideStatus === null) {
    return (
      <ErrorState
        message={RIDE_COVER_TERMS.loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
      />
    );
  }

  const isDraft = rideStatus === 'draft';

  const preview = coverImageUrl ? (
    <div className="relative aspect-[16/9] w-full overflow-hidden">
      <Image
        src={apiAssetUrl(coverImageUrl)}
        alt={RIDE_COVER_TERMS.previewAlt}
        fill
        sizes="(min-width: 1024px) 60vw, 100vw"
        className="object-cover"
      />
    </div>
  ) : (
    <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 bg-surface p-6 text-center">
      <ImageIcon aria-hidden="true" className="size-8 text-text-muted" />
      <p className="text-body-sm font-medium text-text">
        {RIDE_COVER_TERMS.emptyTitle}
      </p>
      {isDraft && (
        <p className="max-w-sm text-body-sm text-text-secondary">
          {RIDE_COVER_TERMS.emptyDescription}
        </p>
      )}
    </div>
  );

  const rules = (
    <Card className="flex flex-col gap-3">
      <h3 className="text-body font-semibold text-text">
        {RIDE_COVER_TERMS.rulesTitle}
      </h3>
      <dl className="flex flex-col divide-y divide-border text-body-sm">
        {(
          [
            [RIDE_COVER_TERMS.rulesFormat, RIDE_COVER_TERMS.rulesFormatValue],
            [RIDE_COVER_TERMS.rulesSize, RIDE_COVER_TERMS.rulesSizeValue],
            [RIDE_COVER_TERMS.rulesFit, RIDE_COVER_TERMS.rulesFitValue],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 py-2 first:pt-0"
          >
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-right text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      {!isDraft && (
        <Notice
          title={RIDE_COVER_TERMS.lockedTitle}
          icon={<Lock className="size-5" />}
        >
          {RIDE_COVER_TERMS.lockedText}
        </Notice>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.8fr)]">
        <Card className="overflow-hidden p-0">
          {preview}
          <div className="flex flex-col gap-4 p-4">
            {coverImageUrl && (
              <p className="text-body-sm text-text-secondary">
                {RIDE_COVER_TERMS.previewCaption}
              </p>
            )}

            {isDraft && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="cover-image-file"
                  className="text-body-sm font-medium text-text"
                >
                  {RIDE_COVER_TERMS.uploadLabel}
                </label>
                <FileInput
                  id="cover-image-file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  disabled={isPending}
                />
              </div>
            )}

            {storageUnavailable && (
              <ErrorState
                message={RIDE_COVER_TERMS.storageUnavailable}
                tone="warning"
                variant="inline"
              />
            )}

            {formError && !storageUnavailable && (
              <p role="alert" className="text-body-sm text-danger">
                {formError}
              </p>
            )}

            {successMessage && !formError && !storageUnavailable && (
              <p role="status" className="text-body-sm text-success">
                {successMessage}
              </p>
            )}

            {isDraft && (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  isLoading={isPending}
                  onClick={handleUpload}
                  className="self-start"
                >
                  {isPending
                    ? RIDE_COVER_TERMS.uploadPending
                    : coverImageUrl
                      ? RIDE_COVER_TERMS.replace
                      : RIDE_COVER_TERMS.upload}
                </Button>
                {coverImageUrl && (
                  <Button
                    type="button"
                    variant="danger"
                    isLoading={isPending}
                    onClick={handleDelete}
                    className="self-start"
                  >
                    {RIDE_COVER_TERMS.delete}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
        {rules}
      </div>
    </div>
  );
}
