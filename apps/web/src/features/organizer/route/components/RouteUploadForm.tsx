'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  ErrorState,
  FileInput,
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
  syncRideMetricsFromRoute,
  uploadRoute,
  type RoutePoint,
  type RouteSummary,
  type Stop,
} from '../api';
import { RouteBuilder } from './RouteBuilder';
import { RoutePointsSection } from './RoutePointsSection';
import { StopsSection } from './StopsSection';

type LoadStatus = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizer/rides/[id]/route` (CR-027, `docs/design.md` §8). Draft-only, same gate
 * `EditRideForm` uses for the rest of ride configuration — download stays available
 * at any status (viewer-visibility rule mirrors `GET /v1/rides/:id`,
 * `.claude/context/current-task.md`), only upload/replace/delete require `draft`.
 *
 * CR-029 ("Route metadata", resolves KI-034): also tracks the ride's own
 * `distanceKm`/`elevationGainMeters` (`Ride`'s organizer-entered fields, distinct
 * from `route`'s GPX-computed ones) to show a reconciliation note when they diverge.
 */
export function RouteUploadForm({ rideId }: { rideId: string }) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const [rideDistanceKm, setRideDistanceKm] = useState<number | null>(null);
  const [rideElevationGainMeters, setRideElevationGainMeters] = useState<
    number | null
  >(null);
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const state = await getRideRouteState(rideId);
    setRideStatus(state.status);
    setRideDistanceKm(state.distanceKm);
    setRideElevationGainMeters(state.elevationGainMeters);
    setStart(state.start);
    setRoute(state.route);
    setStops(state.stops);
    setRoutePoints(state.routePoints);
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
      if (isReplace) {
        await replaceRoute(rideId, file);
      } else {
        await uploadRoute(rideId, file);
      }
      // Re-fetches rather than trusting the upload response alone: a first upload
      // may have auto-filled the ride's own distanceKm/elevationGainMeters
      // (CR-029, resolves KI-034) — reloading keeps this screen's mismatch check
      // accurate against what the server actually did, not a locally-guessed copy
      // of its auto-fill logic.
      await reload();
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

  async function handleSync() {
    if (isPending || !route) return;

    resetMessages();
    setIsPending(true);
    try {
      await syncRideMetricsFromRoute(rideId, {
        distanceKm: route.distanceKm,
        elevationGainMeters: route.elevationGainMeters,
      });
      await reload();
      setSuccessMessage(RIDE_ROUTE_TERMS.metricsSyncSuccess);
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
    return (
      <ErrorState
        message={RIDE_ROUTE_TERMS.loadError}
        onRetry={() => setLoadAttempt((n) => n + 1)}
      />
    );
  }

  const isDraft = rideStatus === 'draft';
  const distance = route ? formatDistanceParts(route.distanceKm) : null;
  const elevation = route
    ? formatElevationParts(route.elevationGainMeters)
    : null;
  // CR-029 ("Route metadata", resolves KI-034): `rides.distanceKm`/
  // `routes.distanceKm` share the same `numeric(6,1)` precision server-side (and
  // likewise `elevationGainMeters` is a plain `integer` on both), so a direct `!==`
  // is exact — no floating-point tolerance needed.
  const hasMetricsMismatch =
    route !== null &&
    (rideDistanceKm !== route.distanceKm ||
      rideElevationGainMeters !== route.elevationGainMeters);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/organizer/rides/${rideId}/edit`}
        className="text-sm font-medium text-primary hover:underline"
      >
        {RIDE_ROUTE_TERMS.backToEdit}
      </Link>

      {/* CR-114: building on 2GIS roads comes first — it's the path that
          can't produce a line through a river; GPX upload stays below as the
          alternative for an organizer who already has a recorded track. */}
      {isDraft && (
        <RouteBuilder
          rideId={rideId}
          hasRoute={route !== null}
          start={start}
          onBuilt={reload}
        />
      )}

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
            {hasMetricsMismatch && (
              <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3">
                <p className="text-sm text-warning">
                  {RIDE_ROUTE_TERMS.metricsMismatch}
                </p>
                <p className="text-sm text-text-secondary">
                  {RIDE_ROUTE_TERMS.metricsMismatchRide}:{' '}
                  {formatDistanceParts(rideDistanceKm).value}{' '}
                  {formatDistanceParts(rideDistanceKm).unit} ·{' '}
                  {formatElevationParts(rideElevationGainMeters).value}{' '}
                  {formatElevationParts(rideElevationGainMeters).unit}
                  {' — '}
                  {RIDE_ROUTE_TERMS.metricsMismatchTrack}: {distance!.value}{' '}
                  {distance!.unit} · {elevation!.value} {elevation!.unit}
                </p>
                {isDraft && (
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={isPending}
                    onClick={handleSync}
                    className="self-start"
                  >
                    {RIDE_ROUTE_TERMS.metricsSyncAction}
                  </Button>
                )}
              </div>
            )}
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
            <FileInput
              id="route-gpx-file"
              ref={fileInputRef}
              accept=".gpx,application/gpx+xml"
              disabled={isPending}
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

      <StopsSection
        rideId={rideId}
        stops={stops}
        isDraft={isDraft}
        onChange={reload}
      />

      <RoutePointsSection
        rideId={rideId}
        routePoints={routePoints}
        isDraft={isDraft}
        onChange={reload}
      />
    </div>
  );
}
