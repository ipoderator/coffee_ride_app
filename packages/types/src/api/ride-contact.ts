import { z } from 'zod';
import { RIDE_CONTACT_TYPES, type RideContactType } from '../domain/ride.js';

// CR-165: the optional per-ride organizer contact. Validation AND normalization
// live here, in `packages/types`, so `apps/api` (request validation) and
// `apps/web` (the organizer forms) apply exactly one definition of "a valid
// Telegram handle" rather than drifting apart — the same single-source-of-truth
// reasoning `domain/ride.ts` gives for the status/bicycle-type enums.
//
// Normalization is deliberate: the ride page turns a stored value into a link
// (`tel:`, `https://t.me/…`, `mailto:`), and doing that reliably means the stored
// form is already canonical. Parsing an organizer's raw «+7 (916) 123-45-67» at
// every render instead would be the same work done repeatedly, in more places.

/** Digits-only view of a phone number, for normalization/validation below. */
function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Russian mobile/landline numbers, normalized to `+7XXXXXXXXXX`.
 *
 * Accepts the shapes organizers actually type — `+7 916 123-45-67`,
 * `8 (916) 123-45-67`, `79161234567` — because rejecting a number over its
 * punctuation would be a validation failure the user cannot act on. A leading
 * `8` is the Russian domestic trunk prefix and maps to `+7`.
 *
 * `docs/product.md`: the market is Russian, so a Russian-format rule is the
 * right tier here — this is stricter than `users.ts`'s deliberately loose
 * `phone`, which is a free-text emergency contact rather than something the UI
 * builds a `tel:` link from.
 */
export function normalizeRussianPhone(raw: string): string | null {
  let digits = digitsOf(raw);
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    // A number typed without any country/trunk prefix at all.
    digits = `7${digits}`;
  }
  if (digits.length !== 11 || !digits.startsWith('7')) return null;
  return `+${digits}`;
}

/** `@handle` / `handle` / a `t.me/handle` link → the bare handle. */
export function normalizeTelegramHandle(raw: string): string | null {
  const trimmed = raw.trim();
  // Organizers paste the profile link as often as they type the handle.
  const fromUrl = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/(.+)$/i,
  );
  const candidate = (fromUrl ? fromUrl[1]! : trimmed).replace(/^@/, '').trim();
  // Telegram's own rule: 5–32 chars, latin letters/digits/underscore.
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(candidate)) return null;
  return candidate;
}

/**
 * One contact as submitted by an organizer. `value` is validated against
 * `type`, then rewritten to its canonical form — so what reaches the service
 * layer (and the database) is already normalized.
 */
export const rideContactSchema = z
  .object({
    type: z.enum(RIDE_CONTACT_TYPES, 'Choose a valid contact type.'),
    value: z
      .string()
      .trim()
      .min(1, 'Contact value cannot be empty.')
      .max(200, 'Contact value must be at most 200 characters.'),
  })
  .transform((contact, ctx): { type: RideContactType; value: string } => {
    switch (contact.type) {
      case 'phone':
      case 'max': {
        // MAX (max.ru) accounts are phone-number-based, so both normalize the
        // same way; they stay distinct types because the ride page links to a
        // different place for each.
        const normalized = normalizeRussianPhone(contact.value);
        if (!normalized) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message:
              'Enter a valid Russian phone number, e.g. +7 916 123-45-67.',
          });
          return z.NEVER;
        }
        return { type: contact.type, value: normalized };
      }
      case 'telegram': {
        const normalized = normalizeTelegramHandle(contact.value);
        if (!normalized) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Enter a valid Telegram username, e.g. @coffee_ride.',
          });
          return z.NEVER;
        }
        return { type: 'telegram', value: normalized };
      }
      case 'email': {
        // Same idiom as `api/auth.ts`'s own email fields.
        const parsed = z
          .string()
          .trim()
          .toLowerCase()
          .email()
          .safeParse(contact.value);
        if (!parsed.success) {
          ctx.addIssue({
            code: 'custom',
            path: ['value'],
            message: 'Enter a valid email address.',
          });
          return z.NEVER;
        }
        return { type: 'email', value: parsed.data };
      }
    }
  });

export type RideContactInput = z.input<typeof rideContactSchema>;
