import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LEGAL_DOCUMENT_TYPES, LEGAL_DOCUMENTS } from 'types';
import { LEGAL_DOCUMENT_TEXT } from './content';

// CR-268 (ADR-041): a version's text is immutable — its SHA-256 is recorded with
// every acceptance. Editing a published text without adding a version fails here;
// so does a version listed in the registry without its text.

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

describe('legal documents', () => {
  for (const type of LEGAL_DOCUMENT_TYPES) {
    describe(type, () => {
      const { versions } = LEGAL_DOCUMENTS[type];

      it('has a text for every listed version, hashing to the listed SHA-256', () => {
        for (const version of versions) {
          const text = LEGAL_DOCUMENT_TEXT[type][version.version];
          expect(text, `${type} ${version.version}`).toBeDefined();
          expect(sha256(text), `${type} ${version.version}`).toBe(
            version.sha256,
          );
        }
      });

      it('lists every text it has, with unique versions and ascending dates', () => {
        expect(Object.keys(LEGAL_DOCUMENT_TEXT[type]).sort()).toEqual(
          versions.map((v) => v.version).sort(),
        );
        expect(new Set(versions.map((v) => v.version)).size).toBe(
          versions.length,
        );
        const dates = versions.map((v) => v.effectiveAt);
        expect([...dates].sort()).toEqual(dates);
        expect(versions[0]?.material).toBe(true);
      });
    });
  }
});
