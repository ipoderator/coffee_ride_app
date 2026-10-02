'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  buttonClassName,
  Card,
  cn,
  ErrorState,
  FileInput,
  Notice,
  RIDE_ROUTE_TERMS,
  Skeleton,
  formatDistanceParts,
  formatElevationParts,
} from 'ui';
import { useRideWorkspace } from '@/lib/cabinet/ride-workspace';
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
import { RouteTrackSketch } from './RouteTrackSketch';
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
 *
 * CR-187: a published ride's route is a result, not a disabled form — a lock
 * notice saying why, the track sketch with «Скачать GPX», the track facts, then
 * the read-only stops and points. Inside the ride workspace, every change also
 * refreshes the workspace (its «Маршрут» chip and overview row).
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
  const workspace = useRideWorkspace();
  const refreshWorkspace = workspace?.refresh;

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

  /** After a change: this screen's own state, then the workspace's chip. */
  const reloadAll = useCallback(async () => {
    await reload();
    void refreshWorkspace?.();
  }, [reload, refreshWorkspace]);

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
      await reloadAll();
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
      void refreshWorkspace?.();
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
      await reloadAll();
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
        <p className="text-body-sm font-medium text-text">
          {RIDE_ROUTE_TERMS.pageTitle}
        </p>
        <Link
          href="/organizer/rides"
          className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
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

  const details =
    route && distance && elevation ? (
      <div className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-text">
          {RIDE_ROUTE_TERMS.detailsTitle}
        </h3>
        <dl className="flex flex-col divide-y divide-border text-body-sm">
          {(
            [
              [
                RIDE_ROUTE_TERMS.distanceLabel,
                `${distance.value} ${distance.unit}`,
              ],
              [
                RIDE_ROUTE_TERMS.elevationGainLabel,
                `${elevation.value} ${elevation.unit}`,
              ],
              [RIDE_ROUTE_TERMS.pointCountLabel, String(route.pointCount)],
              [RIDE_ROUTE_TERMS.fileNameLabel, route.gpxFileName],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 py-2 first:pt-0"
            >
              <dt className="text-text-secondary">{label}</dt>
              <dd className="text-right font-mono text-text tabular-nums wrap-anywhere">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {hasMetricsMismatch && (
          <div
            className={cn(
              'flex flex-col gap-2 rounded-md px-4 py-3',
              isDraft ? 'border border-warning/30 bg-warning/10' : 'bg-surface',
            )}
          >
            <p
              className={cn(
                'text-body-sm',
                isDraft ? 'text-warning' : 'font-medium text-text',
              )}
            >
              {isDraft
                ? RIDE_ROUTE_TERMS.metricsMismatch
                : RIDE_ROUTE_TERMS.metricsMismatchLocked}
            </p>
            <p className="text-body-sm text-text-secondary">
              {RIDE_ROUTE_TERMS.metricsMismatchRide}:{' '}
              {formatDistanceParts(rideDistanceKm).value}{' '}
              {formatDistanceParts(rideDistanceKm).unit} ·{' '}
              {formatElevationParts(rideElevationGainMeters).value}{' '}
              {formatElevationParts(rideElevationGainMeters).unit}
              {' — '}
              {RIDE_ROUTE_TERMS.metricsMismatchTrack}: {distance.value}{' '}
              {distance.unit} · {elevation.value} {elevation.unit}
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
      </div>
    ) : null;

  const stopsAndPoints = (
    <>
      <StopsSection
        rideId={rideId}
        stops={stops}
        isDraft={isDraft}
        onChange={reloadAll}
      />

      <RoutePointsSection
        rideId={rideId}
        routePoints={routePoints}
        isDraft={isDraft}
        onChange={reloadAll}
      />
    </>
  );

  if (!isDraft) {
    return (
      <div className="flex flex-col gap-4">
        <Notice
          title={RIDE_ROUTE_TERMS.lockedTitle}
          icon={<Lock className="size-5" />}
        >
          {RIDE_ROUTE_TERMS.lockedText}
        </Notice>

        {route ? (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.8fr)]">
            <Card className="overflow-hidden p-0">
              <RouteTrackSketch rideId={rideId} />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col">
                  <p className="text-body font-semibold text-text">
                    {RIDE_ROUTE_TERMS.sketchTitle}
                  </p>
                  <p className="text-body-sm text-text-secondary">
                    {RIDE_ROUTE_TERMS.sketchCaption}
                  </p>
                </div>
                <a
                  href={routeDownloadUrl(rideId)}
                  className={buttonClassName('secondary')}
                >
                  {RIDE_ROUTE_TERMS.downloadShort}
                </a>
              </div>
            </Card>
            <Card>{details}</Card>
          </div>
        ) : (
          <Card className="flex flex-col gap-1">
            <p className="text-body-sm font-medium text-text">
              {RIDE_ROUTE_TERMS.emptyTitle}
            </p>
          </Card>
        )}

        {stopsAndPoints}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* CR-114: building on 2GIS roads comes first — it's the path that
          can't produce a line through a river; GPX upload stays below as the
          alternative for an organizer who already has a recorded track. */}
      <RouteBuilder
        rideId={rideId}
        hasRoute={route !== null}
        start={start}
        onBuilt={reloadAll}
      />

      <Card className="flex flex-col gap-4">
        {route ? (
          <>
            {details}
            <a
              href={routeDownloadUrl(rideId)}
              className="inline-flex min-h-11 items-center self-start text-body-sm font-medium text-primary hover:underline"
            >
              {RIDE_ROUTE_TERMS.download}
            </a>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-body-sm font-medium text-text">
              {RIDE_ROUTE_TERMS.emptyTitle}
            </p>
            <p className="text-body-sm text-text-secondary">
              {RIDE_ROUTE_TERMS.emptyDescription}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="route-gpx-file"
            className="text-body-sm font-medium text-text"
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

        {storageUnavailable && (
          <ErrorState
            message={RIDE_ROUTE_TERMS.storageUnavailable}
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
      </Card>

      {stopsAndPoints}
    </div>
  );
}
