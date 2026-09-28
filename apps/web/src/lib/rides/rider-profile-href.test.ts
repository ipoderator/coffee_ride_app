import { describe, expect, it } from 'vitest';
import {
  parseRiderProfileOrigin,
  riderProfileHref,
} from './rider-profile-href';

describe('riderProfileHref', () => {
  it('builds the card path, with `from` only when given', () => {
    expect(riderProfileHref('r1', 'reg1')).toBe('/rides/r1/riders/reg1');
    expect(riderProfileHref('r1', 'reg1', 'overview')).toBe(
      '/rides/r1/riders/reg1?from=overview',
    );
  });
});

describe('parseRiderProfileOrigin', () => {
  it('accepts only the known origins', () => {
    expect(parseRiderProfileOrigin('overview')).toBe('overview');
    expect(parseRiderProfileOrigin('participants')).toBe('participants');
    expect(parseRiderProfileOrigin('https://evil.example')).toBeNull();
    expect(parseRiderProfileOrigin(['overview'])).toBeNull();
    expect(parseRiderProfileOrigin(undefined)).toBeNull();
  });
});
