import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import {
  DATE_PICKER_TERMS,
  DatePicker,
  FormField,
  RIDE_CREATE_TERMS,
} from 'ui';

// CR-157's calendar date picker, inside `FormField` as the ride forms use it
// (`CreateRideForm`, `EditRideForm`, `RescheduleRideCard`). «Сегодня» is
// pinned to Tue 29 Sep 2026 so every story renders the same month.
const TODAY = '2026-09-29';

interface FieldArgs {
  value: string;
  min?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function Field({ value: initial, min, error, disabled, onChange }: FieldArgs) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-sm pb-[30rem]">
      <FormField
        id="story-date"
        label={RIDE_CREATE_TERMS.startDateLabel}
        error={error}
      >
        <DatePicker
          value={value}
          min={min}
          today={TODAY}
          disabled={disabled}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      </FormField>
    </div>
  );
}

const meta = {
  title: 'UI/DatePicker',
  component: Field,
  tags: ['autodocs'],
  args: { value: '', onChange: fn() },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

const label = RIDE_CREATE_TERMS.startDateLabel;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(label)).toHaveTextContent(
      DATE_PICKER_TERMS.placeholder,
    );
  },
};

export const Selected: Story = {
  args: { value: '2026-10-03' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(label)).toHaveTextContent(
      'Сб, 3 октября 2026',
    );
  },
};

export const WithError: Story = {
  args: { error: RIDE_CREATE_TERMS.startDateRequired },
  play: async ({ canvas }) => {
    const trigger = canvas.getByLabelText(label);
    await expect(trigger).toHaveAttribute('aria-invalid', 'true');
    await expect(trigger).toHaveAccessibleDescription(
      RIDE_CREATE_TERMS.startDateRequired,
    );
  },
};

export const Disabled: Story = {
  args: { value: '2026-10-03', disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText(label)).toBeDisabled();
  },
};

/** Open, with days before `min` disabled — the past can't be picked. */
export const OpenWithMin: Story = {
  args: { min: TODAY },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText(label));
    const dialog = canvas.getByRole('dialog', {
      name: DATE_PICKER_TERMS.dialogLabel,
    });
    await expect(dialog).toHaveTextContent('Сентябрь 2026');
    await expect(
      within(dialog).getByRole('button', { name: 'Пн, 28 сентября 2026' }),
    ).toBeDisabled();
    await expect(
      within(dialog).getByRole('button', {
        name: DATE_PICKER_TERMS.prevMonth,
      }),
    ).toBeDisabled();
    // Left open: the story's a11y check then runs on the calendar itself.
  },
};

/** CR-236 (production QA): a day of the next month, shown greyed at the end
 * of the grid, is picked with a real pointer click — focus on mousedown used
 * to flip the grid to that month and swallow the click. */
export const PicksAdjacentMonthDay: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByLabelText(label));
    await userEvent.click(
      canvas.getByRole('button', { name: 'Вс, 11 октября 2026' }),
    );
    await expect(args.onChange).toHaveBeenCalledWith('2026-10-11');
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(canvas.getByLabelText(label)).toHaveTextContent(
      'Вс, 11 октября 2026',
    );
  },
};

export const OpenDark: Story = {
  ...OpenWithMin,
  globals: { theme: 'dark' },
};
