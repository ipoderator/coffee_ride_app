// CR-232: an admin list's search and filters live in its query string —
// `/admin/rides?q=…&status=…` survives a reload, a shared link, a trip to a
// user's card and back, and the browser's back/forward. The URL is the only
// copy: the list derives its filters from `useSearchParams` and a change is a
// native `history.pushState`, which Next's router mirrors into
// `useSearchParams` with no server round trip (Next docs, «Linking and
// Navigating» → native History API). Anything unknown in the URL falls back to
// the default rather than reaching the API.
//
// Pure helpers only — no `'use client'`, so the server user-card page can build
// its back link with them. The hook is `use-admin-url-filters.ts`.

/** Mirrors the search inputs' `maxLength` and the API's `searchQuery` cap. */
export const ADMIN_SEARCH_MAX_LENGTH = 200;

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

export type AdminUrlFilters = Record<string, string>;

/** `q`, trimmed and capped; empty when absent. */
export function readAdminSearch(params: SearchParamsLike): string {
  return (params.get('q') ?? '').trim().slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

/** `value` when it is one of `allowed`, otherwise `fallback`. */
export function readAdminEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** `?key=value…` for every filter that differs from its default, in the
 * defaults' key order; `''` when all are default — so equal filters always
 * serialize to the same string. */
export function adminFiltersQuery<F extends AdminUrlFilters>(
  filters: F,
  defaults: F,
): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    const value = filters[key];
    if (value && value !== defaults[key]) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
