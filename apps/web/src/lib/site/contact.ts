// The one address the site gives for questions — the legal pages' operator contact
// and «Написать нам» on the maintenance/error screens (CR-265). The static fallback
// page Caddy serves (`deploy/maintenance/index.html`) cannot import it and repeats
// it; keep the two in step.
export const SITE_CONTACT_EMAIL = 'glebchurkin48@gmail.com';
