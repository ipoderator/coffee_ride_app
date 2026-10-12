// CR-141 (KI-064): the `?next=` return target carried through `/login` and
// `/register`, so a visitor sent to sign in from a ride lands back on it.
//
// `next` is attacker-controllable (anyone can craft a `/login?next=…` link).
// The validator and the href builders live in `packages/types` (CR-244), so
// `apps/api` checks the `next` it appends to the emailed verification link
// with the same rules. Checked twice here: by the page before rendering, and
// again by the form right before it navigates.
export { safeNextPath, loginHref, registerHref, verifyEmailHref } from 'types';

/** Where a successful sign-in lands when there is no usable `next`. */
export const DEFAULT_AFTER_LOGIN = '/me';
