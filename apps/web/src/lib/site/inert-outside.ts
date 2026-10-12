/**
 * CR-240: makes everything on the page except `keep` (and its ancestors)
 * `inert` — out of the Tab order, the pointer's reach and the accessibility
 * tree — the way a modal layer has to while it is open. Walks from `keep` up
 * to `<body>` and marks every sibling on the way. Elements that were already
 * inert are left alone, so the returned cleanup restores exactly what this
 * call changed. Attribute rather than the `inert` property, which jsdom
 * does not implement.
 */
export function inertOutside(keep: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = keep;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from<Element>(parent.children)) {
      if (
        sibling === node ||
        !(sibling instanceof HTMLElement) ||
        sibling.hasAttribute('inert')
      ) {
        continue;
      }
      sibling.setAttribute('inert', '');
      changed.push(sibling);
    }
  }
  return () => {
    for (const element of changed) element.removeAttribute('inert');
  };
}
