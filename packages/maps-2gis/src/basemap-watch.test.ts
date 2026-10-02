import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchBasemap } from './basemap-watch.js';

describe('watchBasemap (CR-185)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const reachable = () => Promise.resolve();

  it('stays quiet when the style loads and the tile host answers', async () => {
    const onUnavailable = vi.fn();
    const watch = watchBasemap({ onUnavailable, probe: reachable });
    watch.styleLoaded();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('reports a style that never loads, once the timeout passes', async () => {
    const onUnavailable = vi.fn();
    watchBasemap({ onUnavailable, probe: reachable, styleTimeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(onUnavailable).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable tile host even after the style loaded', async () => {
    const onUnavailable = vi.fn();
    const watch = watchBasemap({
      onUnavailable,
      probe: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    watch.styleLoaded();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('reports a failure the SDK raised exactly once', async () => {
    const onUnavailable = vi.fn();
    const watch = watchBasemap({ onUnavailable, probe: reachable });
    // MapGL raises `invalidtilekey` once per refused tile.
    watch.fail();
    watch.fail();
    watch.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('reports nothing after the map is destroyed', async () => {
    const onUnavailable = vi.fn();
    let rejectProbe: (error: Error) => void = () => {};
    const watch = watchBasemap({
      onUnavailable,
      probe: () =>
        new Promise<void>((_, reject) => {
          rejectProbe = reject;
        }),
    });
    watch.stop();
    rejectProbe(new TypeError('Failed to fetch'));
    watch.fail();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
