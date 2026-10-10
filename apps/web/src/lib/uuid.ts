const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's `:id` params are `z.uuid()` — anything else is a 400, never a record. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
