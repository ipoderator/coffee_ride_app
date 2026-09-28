import { describe, expect, it } from 'vitest';
import { cn, TEXT_ROLES } from './cn';

describe('cn', () => {
  it('keeps a role size next to a text colour (CR-152)', () => {
    for (const role of TEXT_ROLES) {
      expect(cn(`text-${role}`, 'text-text-secondary')).toBe(
        `text-${role} text-text-secondary`,
      );
    }
  });

  it('lets a later role size replace an earlier size', () => {
    expect(cn('text-sm', 'text-body')).toBe('text-body');
    expect(cn('text-h2 md:text-h1', 'text-h3')).toBe('md:text-h1 text-h3');
  });
});
