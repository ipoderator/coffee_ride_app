import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterEnabled, isFeatureEnabled } from './feature-flags';

describe('isFeatureEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default when the env var is unset', () => {
    expect(isFeatureEnabled('UNSET_FLAG')).toBe(false);
  });

  it('is disabled for any value other than "1"/"true"', () => {
    vi.stubEnv('FEATURE_SOME_FLAG', 'yes');
    expect(isFeatureEnabled('SOME_FLAG')).toBe(false);
  });

  it('is enabled for "true" (case-insensitive)', () => {
    vi.stubEnv('FEATURE_SOME_FLAG', 'True');
    expect(isFeatureEnabled('SOME_FLAG')).toBe(true);
  });

  it('is enabled for "1"', () => {
    vi.stubEnv('FEATURE_SOME_FLAG', '1');
    expect(isFeatureEnabled('SOME_FLAG')).toBe(true);
  });
});

describe('filterEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('always keeps an item with no flag', () => {
    const items = [{ id: 'a' }, { id: 'b', flag: undefined }];
    expect(filterEnabled(items)).toEqual(items);
  });

  it('drops a flagged item whose flag is off', () => {
    const items = [{ id: 'a', flag: 'SOME_FLAG' }];
    expect(filterEnabled(items)).toEqual([]);
  });

  it('keeps a flagged item whose flag is on', () => {
    vi.stubEnv('FEATURE_SOME_FLAG', 'true');
    const items = [{ id: 'a', flag: 'SOME_FLAG' }];
    expect(filterEnabled(items)).toEqual(items);
  });

  it('preserves order across mixed flagged/unflagged items', () => {
    vi.stubEnv('FEATURE_ON_FLAG', 'true');
    const items = [
      { id: 'a', flag: 'OFF_FLAG' },
      { id: 'b' },
      { id: 'c', flag: 'ON_FLAG' },
    ];
    expect(filterEnabled(items)).toEqual([
      { id: 'b' },
      { id: 'c', flag: 'ON_FLAG' },
    ]);
  });
});
