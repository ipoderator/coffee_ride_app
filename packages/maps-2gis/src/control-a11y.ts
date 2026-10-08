// QA live audit 2026-10-08, item 6: MapGL draws its zoom buttons (32×32, an
// icon and nothing else) and its 2GIS logo link with no accessible name — a
// screen reader announced «кнопка», «кнопка», «ссылка». The SDK takes no
// labels, so they are set on its own elements once they appear. Its class
// names are build hashes (`mapgl_mjx-K8iaDdc-`), so the controls are found by
// shape instead: the zoom control is the one parent holding two unnamed
// buttons, zoom-in first (checked against `@2gis/mapgl` 1.78's markup), and
// the logo is the link to `2gis`.

/** The Russian names, from the app's terminology module (`MAP_CONTROL_TERMS`). */
export interface MapControlLabels {
  zoomIn: string;
  zoomOut: string;
  attribution: string;
}

/** WCAG 2.5.5's 44×44 target; the icon stays the SDK's 32 px, centred. */
export const MIN_CONTROL_TARGET_PX = 44;

function isUnnamed(element: Element): boolean {
  return (
    !element.hasAttribute('aria-label') &&
    !element.hasAttribute('aria-labelledby') &&
    !element.textContent?.trim()
  );
}

function name(element: HTMLElement, label: string) {
  element.setAttribute('aria-label', label);
  element.setAttribute('title', label);
}

function enlarge(button: HTMLElement) {
  const size = `${MIN_CONTROL_TARGET_PX}px`;
  button.style.width = size;
  button.style.height = size;
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
}

function applyLabels(container: HTMLElement, labels: MapControlLabels) {
  const unnamedByParent = new Map<Element, HTMLElement[]>();
  for (const button of container.querySelectorAll<HTMLElement>('button')) {
    const parent = button.parentElement;
    if (!parent || !isUnnamed(button)) continue;
    unnamedByParent.set(parent, [
      ...(unnamedByParent.get(parent) ?? []),
      button,
    ]);
  }
  for (const [parent, buttons] of unnamedByParent) {
    if (
      buttons.length !== 2 ||
      parent.querySelectorAll('button').length !== 2
    ) {
      continue;
    }
    const [zoomIn, zoomOut] = buttons as [HTMLElement, HTMLElement];
    name(zoomIn, labels.zoomIn);
    name(zoomOut, labels.zoomOut);
    enlarge(zoomIn);
    enlarge(zoomOut);
  }

  for (const link of container.querySelectorAll<HTMLElement>(
    'a[href*="2gis"]',
  )) {
    if (isUnnamed(link)) name(link, labels.attribution);
  }
}

/**
 * Names MapGL's controls inside `container` now and whenever the SDK
 * (re)draws them. Returns the function that stops watching — call it when
 * the map is destroyed. Only `childList` is observed, so setting the labels
 * never re-triggers the observer.
 */
export function labelMapControls(
  container: HTMLElement,
  labels: MapControlLabels,
): () => void {
  applyLabels(container, labels);
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(() => applyLabels(container, labels));
  observer.observe(container, { childList: true, subtree: true });
  return () => observer.disconnect();
}
