import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useRef, useState } from 'react';
import { expect, fn } from 'storybook/test';
import { FormField, TimeInput, VALIDATION_TERMS } from 'ui';

// QA live audit 2026-10-08, item 1: the ride forms' start time. Always inside
// `FormField`, as the forms use it.
interface FieldArgs {
  value: string;
  error?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

function Field({ value, error, disabled, onValueChange }: FieldArgs) {
  return (
    <div className="max-w-xs">
      <FormField id="story-time" label="Время старта" error={error}>
        <TimeInput
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
        />
      </FormField>
    </div>
  );
}

const meta = {
  title: 'UI/TimeInput',
  component: Field,
  tags: ['autodocs'],
  args: { value: '', onValueChange: fn() },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Время старта')).toHaveValue('');
  },
};

export const Filled: Story = {
  args: { value: '08:00' },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Время старта')).toHaveValue('08:00');
  },
};

export const WithError: Story = {
  args: { error: VALIDATION_TERMS.required },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Время старта');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(VALIDATION_TERMS.required);
  },
};

export const Disabled: Story = {
  args: { value: '07:30', disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Время старта')).toBeDisabled();
  },
};

/** The audit's case: the field changes with no `input` event (a native
 * picker, autofill), then the form re-renders — the field keeps what it
 * shows, and the save reads it through the ref. */
function SavesWhatItShows() {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('12:12');
  const [saved, setSaved] = useState<string | null>(null);
  const [renders, setRenders] = useState(0);
  return (
    <div className="flex max-w-xs flex-col gap-3">
      <FormField id="story-time-live" label="Время старта">
        <TimeInput ref={ref} value={value} onValueChange={setValue} />
      </FormField>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-border-input px-3 text-body-sm text-text"
        onClick={() => setRenders(renders + 1)}
      >
        Перерисовать форму
      </button>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-border-input px-3 text-body-sm text-text"
        onClick={() => setSaved(ref.current?.value ?? value)}
      >
        Сохранить
      </button>
      <p role="status" className="text-body-sm text-text">
        {saved ? `Сохранено: ${saved}` : ''}
      </p>
    </div>
  );
}

export const KeepsAndSavesWhatItShows: Story = {
  render: () => <SavesWhatItShows />,
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByLabelText<HTMLInputElement>('Время старта');
    input.value = '08:00';
    await userEvent.click(
      canvas.getByRole('button', { name: 'Перерисовать форму' }),
    );
    await expect(input).toHaveValue('08:00');
    await userEvent.click(canvas.getByRole('button', { name: 'Сохранить' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Сохранено: 08:00',
    );
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { value: '08:00' },
};
