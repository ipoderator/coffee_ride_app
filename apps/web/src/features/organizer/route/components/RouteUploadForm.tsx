'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  MetricTile,
  RIDE_ROUTE_TERMS,
  Skeleton,
  formatDistanceParts,
  formatElevationParts,
} from 'ui';
import {
  ApiError,
  deleteRoute,
  getRideRouteState,
  replaceRoute,
  routeDownloadUrl,
  uploadRoute,
  type RouteSummary,
} from '../api';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizer/rides/[id]/route` (CR-027, `docs/design.md` §8). Draft-only, same gate
 * `EditRideForm` uses for the rest of ride configuration — download stays available
 * at any status (viewer-visibility rule mirrors `GET /v1/rides/:id`,
 * `.claude/context/current-task.md`), only upload/replace/delete require `draft`.
 */
export function RouteUploadForm({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    getRideRouteState(rideId)
      .then((state) => {
        if (cancelled) return;
        setRideStatus(state.status);
        setRoute(state.route);
        setStatus('ready');
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
  }, [rideId]);

  function resetMessages() {
    setFormError(null);
    setStorageUnavailable(false);
    setSuccessMessage(null);
  }

  function handleUploadError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError(RIDE_ROUTE_TERMS.loadError);
      return;
    }
    switch (error.problem.code) {
      case 'gpx_file_missing':
        setFormError(RIDE_ROUTE_TERMS.gpxFileMissing);
        break;
      case 'gpx_invalid':
        setFormError(RIDE_ROUTE_TERMS.gpxInvalid);
        break;
      case 'gpx_file_too_large':
        setFormError(RIDE_ROUTE_TERMS.gpxFileTooLarge);
        break;
      case 'route_storage_unavailable':
        // `.claude/rules/resilience.md`'s degraded state — an inline warning next to
        // still-usable content, not a hard failure blocking the rest of the screen.
        setStorageUnavailable(true);
        break;
      default:
        setFormError(RIDE_ROUTE_TERMS.loadError);
    }
  }

  async function handleUpload() {
    if (isPending) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError(RIDE_ROUTE_TERMS.gpxFileMissing);
      return;
    }

    resetMessages();
    setIsPending(true);
    try {
      const isReplace = route !== null;
      const uploaded = isReplace
        ? await replaceRoute(rideId, file)
        : await uploadRoute(rideId, file);
      setRoute(uploaded);
      setSuccessMessage(
        isReplace
          ? RIDE_ROUTE_TERMS.replaceSuccess
          : RIDE_ROUTE_TERMS.uploadSuccess,
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
    if (!window.confirm(RIDE_ROUTE_TERMS.deleteConfirm)) return;

    resetMessages();
    setIsPending(true);
    try {
      await deleteRoute(rideId);
      setRoute(null);
      setSuccessMessage(RIDE_ROUTE_TERMS.deleteSuccess);
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
          {RIDE_ROUTE_TERMS.pageTitle}
        </p>
        <Link
          href="/organizer/rides"
          className="text-sm font-medium text-primary hover:underline"
        >
          {RIDE_ROUTE_TERMS.backToEdit}
        </Link>
      </Card>
    );
  }

  if (status === 'error' || rideStatus === null) {
    return <ErrorState message={RIDE_ROUTE_TERMS.loadError} />;
  }

  const isDraft = rideStatus === 'draft';
  const distance = route ? formatDistanceParts(route.distanceKm) : null;
  const elevation = route
    ? formatElevationParts(route.elevationGainMeters)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/organizer/rides/${rideId}/edit`}
        className="text-sm font-medium text-primary hover:underline"
      >
        {RIDE_ROUTE_TERMS.backToEdit}
      </Link>

      <Card className="flex flex-col gap-4">
        {!isDraft && (
          <p role="status" className="text-sm text-warning">
            {RIDE_ROUTE_TERMS.notEditable}
          </p>
        )}

        {route ? (
          <>
            <div className="flex flex-wrap gap-6">
              {distance && (
                <MetricTile
                  label={RIDE_ROUTE_TERMS.distanceLabel}
                  value={distance.value}
                  unit={distance.unit}
                />
              )}
              {elevation && (
                <MetricTile
                  label={RIDE_ROUTE_TERMS.elevationGainLabel}
                  value={elevation.value}
                  unit={elevation.unit}
                />
              )}
              <MetricTile
                label={RIDE_ROUTE_TERMS.pointCountLabel}
                value={String(route.pointCount)}
              />
            </div>
            <p className="text-sm text-text-secondary">
              {RIDE_ROUTE_TERMS.fileNameLabel}: {route.gpxFileName}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={routeDownloadUrl(rideId)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {RIDE_ROUTE_TERMS.download}
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text">
              {RIDE_ROUTE_TERMS.emptyTitle}
            </p>
            <p className="text-sm text-text-secondary">
              {RIDE_ROUTE_TERMS.emptyDescription}
            </p>
          </div>
        )}

        {isDraft && (
          <div className="flex flex-col gap-2">
            <label
              htmlFor="route-gpx-file"
              className="text-sm font-medium text-text"
            >
              {RIDE_ROUTE_TERMS.uploadLabel}
            </label>
            <input
              id="route-gpx-file"
              ref={fileInputRef}
              type="file"
              accept=".gpx,application/gpx+xml"
              disabled={isPending}
              className="text-sm text-text"
            />
          </div>
        )}

        {storageUnavailable && (
          <ErrorState
            message={RIDE_ROUTE_TERMS.storageUnavailable}
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
                ? RIDE_ROUTE_TERMS.uploadPending
                : route
                  ? RIDE_ROUTE_TERMS.replace
                  : RIDE_ROUTE_TERMS.upload}
            </Button>
            {route && (
              <Button
                type="button"
                variant="danger"
                isLoading={isPending}
                onClick={handleDelete}
                className="self-start"
              >
                {RIDE_ROUTE_TERMS.delete}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
