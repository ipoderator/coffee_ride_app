// KI-049: a real local dev database (`coffee_ride_dev`, real accumulated QA
// data) was wiped because the test suite read `DATABASE_URL` directly — the
// exact variable `.env` sets for `pnpm dev`/production. Sourcing `.env` for
// any other reason in the same shell silently pointed the suite's unscoped
// `DELETE FROM rides`/`DELETE FROM users` cleanup at real data.
//
// Fix, two independent layers:
//   1. Tests read TEST_DATABASE_URL, a variable `.env` never sets at all —
//      sourcing `.env` structurally cannot feed this suite a real database.
//   2. Even a correctly-set TEST_DATABASE_URL is checked against an
//      allowlist of database-name shapes before any test file is allowed to
//      import it — a wrong value (e.g. copy-pasted from DATABASE_URL) is
//      refused instead of silently wiping whatever it points at.
const SAFE_DATABASE_NAME_PATTERN = /(^|_)test($|_)|^coffee_ride$/;

export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is required to run apps/api tests (this suite needs a real, ' +
        "migrated, disposable Postgres database). Do not set it to .env's DATABASE_URL — " +
        "that points at real dev data. Use the Docker Compose postgres service's own " +
        "'coffee_ride' database instead (see .env.example). See KI-049.",
    );
  }

  let databaseName: string;
  try {
    databaseName = new URL(url).pathname.replace(/^\//, '');
  } catch {
    throw new Error(
      `TEST_DATABASE_URL is not a valid connection string: ${url}`,
    );
  }

  if (!SAFE_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Refusing to run destructive tests against database "${databaseName}": its name ` +
        'does not look disposable (expected a name containing "test", or exactly ' +
        '"coffee_ride"). This suite runs unscoped DELETE statements against whatever ' +
        'database it is pointed at — see KI-049.',
    );
  }

  return url;
}
