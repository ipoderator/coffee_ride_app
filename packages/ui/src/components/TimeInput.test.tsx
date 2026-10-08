import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TimeInput } from './TimeInput';

// QA live audit 2026-10-08, item 1: «08:00» on screen, «12:12» in React state,
// «12:12» saved.
describe('TimeInput', () => {
  it('reports what the user enters', () => {
    const onValueChange = vi.fn();
    render(
      <TimeInput aria-label="Время" value="" onValueChange={onValueChange} />,
    );
    fireEvent.change(screen.getByLabelText('Время'), {
      target: { value: '08:00' },
    });
    expect(onValueChange).toHaveBeenCalledWith('08:00');
  });

  it('keeps a value the form never heard about across a re-render', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(
      <TimeInput
        ref={ref}
        aria-label="Время"
        value="12:12"
        onValueChange={() => {}}
      />,
    );
    // A native picker or tool changing the field without an `input` event.
    ref.current!.value = '08:00';
    rerender(
      <TimeInput
        ref={ref}
        aria-label="Время"
        value="12:12"
        onValueChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByLabelText('Время')).toHaveValue('08:00');
    expect(ref.current!.value).toBe('08:00');
  });

  it('shows a new value the form sets (a loaded draft, a server echo)', () => {
    const { rerender } = render(
      <TimeInput aria-label="Время" value="" onValueChange={() => {}} />,
    );
    rerender(
      <TimeInput aria-label="Время" value="08:00" onValueChange={() => {}} />,
    );
    expect(screen.getByLabelText('Время')).toHaveValue('08:00');
  });

  it('replaces an edited field when the form sets a different value', () => {
    // A save whose response carries another time (the server's echo) wins
    // over what was typed before it.
    const { rerender } = render(
      <TimeInput aria-label="Время" value="08:00" onValueChange={() => {}} />,
    );
    fireEvent.change(screen.getByLabelText('Время'), {
      target: { value: '09:00' },
    });
    rerender(
      <TimeInput aria-label="Время" value="10:30" onValueChange={() => {}} />,
    );
    expect(screen.getByLabelText('Время')).toHaveValue('10:30');
  });

  it('accepts a callback ref', () => {
    let node: HTMLInputElement | null = null;
    render(
      <TimeInput
        ref={(element) => {
          node = element;
        }}
        aria-label="Время"
        value="07:30"
        onValueChange={() => {}}
      />,
    );
    expect(node).toHaveValue('07:30');
  });
});
