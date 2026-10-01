import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn } from 'storybook/test';
import {
  EMPTY_RIDE_CONTACT,
  RideContactFields,
  type RideContactDraft,
} from '@/features/organizer/rides/components/RideContactFields';

// CR-165: the optional «Способ связи с организатором» pair used by both the
// create wizard and the edit form. The value input only exists once a type is
// chosen, so each state below is a genuinely different render, not a variant of
// one — which is also why the interactive stories drive the real `<select>`
// rather than passing a frozen `value`.

function Controlled({
  value: initial,
  onChange,
  disabled,
  error,
}: {
  value: RideContactDraft;
  onChange: (next: RideContactDraft) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <RideContactFields
        idPrefix="story"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        disabled={disabled}
        error={error}
      />
    </div>
  );
}

const meta = {
  title: 'Organizer/RideContactFields',
  component: RideContactFields,
  tags: ['autodocs'],
  args: {
    idPrefix: 'story',
    value: EMPTY_RIDE_CONTACT,
    onChange: fn(),
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof RideContactFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: «Не указывать», no value input at all. */
export const NotSpecified: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Как связаться')).toHaveValue('');
    expect(canvas.queryByLabelText('Контакт')).toBeNull();
  },
};

/** Choosing a type reveals the value input with a matching placeholder. */
export const ChoosingAType: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.selectOptions(
      canvas.getByLabelText('Как связаться'),
      'telegram',
    );
    const value = await canvas.findByLabelText('Контакт');
    await expect(value).toHaveAttribute('placeholder', '@coffee_ride');
  },
};

export const Phone: Story = {
  args: { value: { type: 'phone', value: '+7 916 123-45-67' } },
};

export const Telegram: Story = {
  args: { value: { type: 'telegram', value: '@coffee_ride' } },
};

/** MAX (max.ru) is phone-number based, so it shares the phone placeholder. */
export const MessengerMax: Story = {
  args: { value: { type: 'max', value: '+7 916 123-45-67' } },
};

export const Email: Story = {
  args: { value: { type: 'email', value: 'ride@example.com' } },
};

export const WithError: Story = {
  args: {
    value: { type: 'telegram', value: '@a' },
    error: 'Enter a valid Telegram username, e.g. @coffee_ride.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Контакт')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  },
};

/** A non-draft ride renders the whole edit form read-only. */
export const Disabled: Story = {
  args: { value: { type: 'phone', value: '+7 916 123-45-67' }, disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Как связаться')).toBeDisabled();
    await expect(canvas.getByLabelText('Контакт')).toBeDisabled();
  },
};

export const Dark: Story = {
  args: { value: { type: 'telegram', value: '@coffee_ride' } },
  globals: { theme: 'dark' },
};

export const BothThemes: Story = {
  args: { value: { type: 'telegram', value: '@coffee_ride' } },
  globals: { theme: 'both' },
};
