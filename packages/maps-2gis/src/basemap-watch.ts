import { callWithResilience, CircuitBreaker } from 'resilience';

// CR-185 (UX handoff P2): MapGL can construct a map whose basemap never
// draws — markers on a blank canvas, no error thrown. What the SDK reports
// (measured against @2gis/mapgl 1.78 in Chromium):
// - tiles answering 403 (a wrong or domain-restricted key) → `error` events
//   of type `invalidtilekey`;
// - the style failing → `styleloaderror`;
// - tile servers unreachable (blocked network) → nothing at all: no error,
//   and `idle` cannot tell it apart (it fires once loading gives up, but
//   also after a normal load). Tiles are fetched inside MapGL's worker, so
//   the page cannot observe them either.
// Hence the watch: the reported failures, a style that never loads, and a
// reachability probe of the tile host — an opaque `no-cors` request that
// resolves on any HTTP answer and rejects only when the host can't be
// reached at all.

/** The host MapGL loads vector tiles from (`tile0..3-sdk.maps.2gis.com`).
 * The weekly 2GIS contract job checks it still answers
 * (`provider.contract.test.ts`), so a move shows up there first. */
export const TILE_PROBE_URL = 'https://tile0-sdk.maps.2gis.com/';
/** MapGL error-event types after which the basemap cannot draw. */
export const FATAL_MAP_ERRORS: ReadonlySet<string> = new Set([
  'invalidtilekey',
  'styleloaderror',
  'webglcontextlost',
]);

const STYLE_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 8_000;
// A GET with no side effect — one retry per `.claude/rules/resilience.md`.
const PROBE_MAX_ATTEMPTS = 2;

// One breaker for every probe on the page (`.claude/rules/resilience.md`:
// shared per integration, not per call): repeated failures stop sending
// probes for a while and report the basemap unavailable at once.
const probeBreaker = new CircuitBreaker({
  failureThreshold: 3,
  cooldownMs: 30_000,
});

async function probeTileHost(): Promise<void> {
  await callWithResilience(
    async (signal) => {
      await fetch(TILE_PROBE_URL, {
        mode: 'no-cors',
        cache: 'no-store',
        signal,
      });
    },
    {
      timeoutMs: PROBE_TIMEOUT_MS,
      retries: { maxAttempts: PROBE_MAX_ATTEMPTS },
      breaker: probeBreaker,
    },
  );
}

export interface BasemapWatch {
  /** MapGL `styleload`. */
  styleLoaded(): void;
  /** A failure the SDK reported (`styleloaderror`, a fatal `error`). */
  fail(): void;
  /** The map is being destroyed — nothing is reported after this. */
  stop(): void;
}

export interface BasemapWatchOptions {
  onUnavailable: () => void;
  styleTimeoutMs?: number;
  /** Test seam; defaults to the real tile-host probe. */
  probe?: () => Promise<void>;
}

/**
 * Reports, at most once, that the basemap can't be shown: a reported
 * failure, no `styleload` within `styleTimeoutMs`, or an unreachable tile
 * host.
 */
export function watchBasemap({
  onUnavailable,
  styleTimeoutMs = STYLE_TIMEOUT_MS,
  probe = probeTileHost,
}: BasemapWatchOptions): BasemapWatch {
  let done = false;
  const fail = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onUnavailable();
  };
  const timer = setTimeout(fail, styleTimeoutMs);
  probe().catch(fail);

  return {
    styleLoaded() {
      clearTimeout(timer);
    },
    fail,
    stop() {
      done = true;
      clearTimeout(timer);
    },
  };
}
