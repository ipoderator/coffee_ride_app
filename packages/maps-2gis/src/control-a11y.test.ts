import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  labelMapControls,
  MIN_CONTROL_TARGET_PX,
  type MapControlLabels,
} from './control-a11y.js';

// This package's tests run in Node (no DOM library here), so the SDK's markup
// is modelled by the few element features `labelMapControls` reads: the
// `@2gis/mapgl` 1.78 zoom control (two icon-only buttons in one parent) and
// its logo link.

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    public textContent = '',
    href?: string,
  ) {
    if (href) this.attributes.set('href', href);
  }

  append(...children: FakeElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'button') {
      return this.descendants().filter((el) => el.tagName === 'BUTTON');
    }
    if (selector === 'a[href*="2gis"]') {
      return this.descendants().filter(
        (el) =>
          el.tagName === 'A' &&
          (el.getAttribute('href') ?? '').includes('2gis'),
      );
    }
    throw new Error(`unexpected selector ${selector}`);
  }
}

const LABELS: MapControlLabels = {
  zoomIn: 'Увеличить масштаб',
  zoomOut: 'Уменьшить масштаб',
  attribution: '2ГИС — условия использования карты',
};

function mapContainer() {
  const zoomIn = new FakeElement('BUTTON');
  const zoomOut = new FakeElement('BUTTON');
  const logo = new FakeElement('A', '', 'https://dev.2gis.ru/link_api_map');
  // One of the app's own markers — already named, must be left alone.
  const marker = new FakeElement('BUTTON');
  marker.setAttribute('aria-label', 'Ночной Гравел, 08:00');
  const container = new FakeElement('DIV').append(
    new FakeElement('DIV').append(zoomIn, zoomOut),
    new FakeElement('DIV').append(logo),
    new FakeElement('DIV').append(marker),
  );
  return { container, zoomIn, zoomOut, logo, marker };
}

function label(container: FakeElement) {
  return labelMapControls(container as unknown as HTMLElement, LABELS);
}

describe('labelMapControls', () => {
  it('names the zoom buttons, zoom-in first, and the 2GIS link', () => {
    const { container, zoomIn, zoomOut, logo } = mapContainer();
    label(container);
    expect(zoomIn.getAttribute('aria-label')).toBe(LABELS.zoomIn);
    expect(zoomIn.getAttribute('title')).toBe(LABELS.zoomIn);
    expect(zoomOut.getAttribute('aria-label')).toBe(LABELS.zoomOut);
    expect(logo.getAttribute('aria-label')).toBe(LABELS.attribution);
  });

  it('gives each zoom button a 44×44 target with the icon centred', () => {
    const { container, zoomIn, zoomOut } = mapContainer();
    label(container);
    for (const button of [zoomIn, zoomOut]) {
      expect(button.style).toMatchObject({
        width: `${MIN_CONTROL_TARGET_PX}px`,
        height: `${MIN_CONTROL_TARGET_PX}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      });
    }
  });

  it('leaves named buttons and anything not shaped like the zoom pair alone', () => {
    const { container, marker } = mapContainer();
    const lone = new FakeElement('BUTTON');
    container.append(new FakeElement('DIV').append(lone));
    label(container);
    expect(marker.getAttribute('aria-label')).toBe('Ночной Гравел, 08:00');
    expect(marker.style).toEqual({});
    expect(lone.hasAttribute('aria-label')).toBe(false);
  });

  it('works without MutationObserver and returns a no-op stop', () => {
    const { container } = mapContainer();
    const stop = label(container);
    expect(() => stop()).not.toThrow();
  });
});

describe('labelMapControls — controls the SDK draws later', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('labels controls added after the first pass, then stops when told', () => {
    let notify: (() => void) | null = null;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const container = new FakeElement('DIV');
    const stop = label(container);

    // MapGL mounts its zoom control after the map is constructed.
    const zoomIn = new FakeElement('BUTTON');
    const zoomOut = new FakeElement('BUTTON');
    container.append(new FakeElement('DIV').append(zoomIn, zoomOut));
    notify!();
    expect(zoomIn.getAttribute('aria-label')).toBe(LABELS.zoomIn);
    expect(zoomOut.getAttribute('aria-label')).toBe(LABELS.zoomOut);

    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('does not rename a link that already has a name', () => {
    const named = new FakeElement('A', '2ГИС', 'https://2gis.ru');
    const container = new FakeElement('DIV').append(named);
    label(container);
    expect(named.hasAttribute('aria-label')).toBe(false);
  });
});
