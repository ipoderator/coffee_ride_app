import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_RIDE_CONTACT,
  RideContactFields,
  rideContactFromResponse,
  rideContactToRequest,
  type RideContactDraft,
} from './components/RideContactFields';

// CR-165. The Storybook stories render every visual state; these cover the
// module's own branching — the type→value coupling and the two converters that
// sit between the form and the API.

function Harness({ initial }: { initial?: RideContactDraft }) {
  const [value, setValue] = useState(initial ?? EMPTY_RIDE_CONTACT);
  return <RideContactFields idPrefix="t" value={value} onChange={setValue} />;
}

function select(value: string) {
  fireEvent.change(screen.getByLabelText('Как связаться'), {
    target: { value },
  });
}

describe('RideContactFields (CR-165)', () => {
  it('shows no value input until a type is chosen', () => {
    render(<Harness />);

    expect(screen.getByLabelText('Как связаться')).toHaveValue('');
    expect(screen.queryByLabelText('Контакт')).not.toBeInTheDocument();
  });

  it('reveals the value input with a per-type placeholder', () => {
    render(<Harness />);

    select('phone');
    expect(screen.getByLabelText('Контакт')).toHaveAttribute(
      'placeholder',
      '+7 916 123-45-67',
    );

    select('email');
    expect(screen.getByLabelText('Контакт')).toHaveAttribute(
      'placeholder',
      'ride@example.com',
    );
  });

  it('clears a typed value when the organizer goes back to «Не указывать»', () => {
    render(<Harness initial={{ type: 'telegram', value: '@coffee_ride' }} />);

    select('');

    expect(screen.queryByLabelText('Контакт')).not.toBeInTheDocument();
    // Re-picking a type starts empty rather than restoring a value that would
    // now be validated against a different type.
    select('phone');
    expect(screen.getByLabelText('Контакт')).toHaveValue('');
  });

  it('offers exactly the four supported types', () => {
    render(<Harness />);

    expect(
      Array.from(
        screen.getByLabelText('Как связаться').querySelectorAll('option'),
      ).map((option) => option.textContent),
    ).toEqual(['Не указывать', 'Телефон', 'Telegram', 'MAX', 'Почта']);
  });

  it('maps a response contact onto the draft, and an absent one onto empty', () => {
    expect(
      rideContactFromResponse({ type: 'max', value: '+79161234567' }),
    ).toEqual({ type: 'max', value: '+79161234567' });
    expect(rideContactFromResponse(undefined)).toEqual(EMPTY_RIDE_CONTACT);
  });

  it('converts a draft to the API payload, trimming and nulling the empty case', () => {
    expect(rideContactToRequest(EMPTY_RIDE_CONTACT)).toBeNull();
    expect(
      rideContactToRequest({ type: 'telegram', value: '  @coffee_ride  ' }),
    ).toEqual({ type: 'telegram', value: '@coffee_ride' });
  });
});
