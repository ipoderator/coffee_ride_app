'use client';

import { useEffect, type RefObject } from 'react';

/** Width of the edge fade, in px — the `2.5rem` in the class below. */
const FADE_PX = 40;

/**
 * CR-241 (production QA): a row of chips/tabs that scrolls sideways on a
 * phone. It fades only an edge that actually hides content — `useScrollRow`
 * sets `data-fade-start`/`data-fade-end` — so the end of the row is never
 * left faded (the old fixed 15 % fade kept the last chip and a focused one
 * there washed out). Hidden scrollbar: the fade is the cue.
 */
export const SCROLL_ROW_CLASSNAME =
  'overflow-x-auto [scrollbar-width:none] [--fade-end:0px] [--fade-start:0px] data-[fade-end]:[--fade-end:2.5rem] data-[fade-start]:[--fade-start:2.5rem] [mask-image:linear-gradient(90deg,transparent,black_var(--fade-start),black_calc(100%-var(--fade-end)),transparent)]';

/**
 * Keeps `SCROLL_ROW_CLASSNAME`'s fade attributes in step with the scroll
 * position and size, and scrolls a child that receives focus clear of the
 * fades — a focus ring under the fade is no visible focus at all.
 */
export function useScrollRow(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const row = ref.current;
    if (!row) return;

    function update() {
      if (!row) return;
      const max = row.scrollWidth - row.clientWidth;
      row.toggleAttribute('data-fade-start', max > 1 && row.scrollLeft > 1);
      row.toggleAttribute('data-fade-end', max > 1 && row.scrollLeft < max - 1);
    }
    function handleFocusIn(event: FocusEvent) {
      if (!row || !(event.target instanceof HTMLElement)) return;
      revealInRow(row, event.target, false);
    }

    update();
    row.addEventListener('scroll', update, { passive: true });
    row.addEventListener('focusin', handleFocusIn);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      row.removeEventListener('focusin', handleFocusIn);
      observer?.disconnect();
    };
  }, [ref]);
}

/**
 * Scrolls `row` horizontally by the least distance that puts `element`
 * clear of the edge fades (its start edge when it is wider than that). Not
 * `scrollIntoView` — that also scrolls the page. No-op when it already fits,
 * or when the row is hidden (`display: none`) and everything measures zero.
 */
export function revealInRow(
  row: HTMLElement,
  element: HTMLElement,
  smooth: boolean,
): void {
  const rowBox = row.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(row);
  const start =
    rowBox.left + Math.max(parseFloat(style.paddingLeft) || 0, FADE_PX);
  const end =
    rowBox.right - Math.max(parseFloat(style.paddingRight) || 0, FADE_PX);
  let delta = 0;
  if (box.width > end - start || box.left < start) {
    delta = box.left - start;
  } else if (box.right > end) {
    delta = box.right - end;
  }
  const left = Math.max(0, row.scrollLeft + delta);
  if (left === row.scrollLeft) return;
  row.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}
