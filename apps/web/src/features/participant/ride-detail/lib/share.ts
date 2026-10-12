/**
 * CR-242 (production QA): «Поделиться» tried the share sheet, else the async
 * clipboard, and on any failure only said «Не удалось…» — no link, no way on.
 * `navigator.clipboard` does not exist outside a secure context and is
 * refused by some in-app browsers; a share sheet can fail for reasons other
 * than the viewer closing it. Each step now falls through to the next, and
 * the last one (`'manual'`) is for the caller to show the link itself.
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'copied' | 'manual';

export async function shareLink(link: {
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(link);
      return 'shared';
    } catch (error) {
      // The viewer closing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'dismissed';
      }
    }
  }
  return (await copyText(link.url)) ? 'copied' : 'manual';
}

/** The async clipboard, else the legacy `execCommand('copy')`. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (permissions, an in-app browser) — try the legacy path.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const previous =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    previous?.focus();
  }
}
