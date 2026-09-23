'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  FileInput,
  RIDE_COVER_TERMS,
  Skeleton,
} from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
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
        <p className="text-sm font-medium text-text">
          {RIDE_COVER_TERMS.pageTitle}
        </p>
        <Link
          href="/organizer/rides"
          className="text-sm font-medium text-primary hover:underline"
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

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/organizer/rides/${rideId}/edit`}
        className="text-sm font-medium text-primary hover:underline"
      >
        {RIDE_COVER_TERMS.backToEdit}
      </Link>

      <Card className="flex flex-col gap-4">
        {!isDraft && (
          <p role="status" className="text-sm text-warning">
            {RIDE_COVER_TERMS.notEditable}
          </p>
        )}

        {coverImageUrl ? (
          <div className="relative h-64 w-full overflow-hidden rounded-xl">
            <Image
              src={apiAssetUrl(coverImageUrl)}
              alt=""
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text">
              {RIDE_COVER_TERMS.emptyTitle}
            </p>
            <p className="text-sm text-text-secondary">
              {RIDE_COVER_TERMS.emptyDescription}
            </p>
          </div>
        )}

        {isDraft && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="cover-image-file"
              className="text-sm font-medium text-text"
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
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {successMessage && !formError && !storageUnavailable && (
          <p role="status" className="text-sm text-success">
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
      </Card>
    </div>
  );
}
