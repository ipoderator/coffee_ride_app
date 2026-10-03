// CR-205: `Content-Disposition: attachment` for a user-supplied filename (the
// uploaded GPX's original name). Interpolating it raw breaks two ways: Node
// refuses any character above U+00FF in a header (`ERR_INVALID_CHAR` → a 500 for
// every Cyrillic name), and a `"` closes the quoted string, letting the name add
// its own parameters. RFC 6266: a printable-ASCII `filename` fallback plus the
// exact name as RFC 5987 `filename*`, which every current browser prefers.

const UNSAFE_FALLBACK_CHARS = /[^\x20-\x7e]|["\\]/g;

function encodeRfc5987(value: string): string {
  // encodeURIComponent leaves `'()*` alone; RFC 5987's attr-char excludes them.
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function attachmentContentDisposition(filename: string): string {
  const fallback = filename.replace(UNSAFE_FALLBACK_CHARS, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`;
}
