import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import {
  FormField,
  Input,
  Skeleton,
  VALIDATION_TERMS,
  type InputProps,
} from 'ui';

// `Input` is always used inside `FormField` (a real `<label>`, the hint/error
// wired through `aria-describedby`/`aria-invalid`) — the stories do the same,
// so the a11y checks see what users actually get.
interface FieldArgs extends InputProps {
  label: string;
  hint?: string;
  error?: string;
}

function Field({ label, hint, error, ...input }: FieldArgs) {
  return (
    <div className="max-w-sm">
      <FormField id="story-input" label={label} hint={hint} error={error}>
        <Input {...input} />
      </FormField>
    </div>
  );
}

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    label: 'Место старта',
    placeholder: 'Например, Воробьёвы горы',
    hint: 'Где группа собирается перед стартом',
    onChange: fn(),
  },
  render: (args) => <Field {...args} />,
} satisfies Meta<FieldArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByLabelText('Место старта');
    await expect(input).toHaveAccessibleDescription(
      'Где группа собирается перед стартом',
    );
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'Лужники');
    await expect(input).toHaveValue('Лужники');
    await expect(args.onChange).toHaveBeenCalled();
  },
};

export const Filled: Story = {
  args: { defaultValue: 'Воробьёвы горы, смотровая площадка' },
};

/** Nothing typed yet: the placeholder shows, the value is empty. */
export const Empty: Story = {
  args: { hint: undefined },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Место старта');
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute(
      'placeholder',
      'Например, Воробьёвы горы',
    );
  },
};

/** Validation error: replaces the hint, announced, linked to the field. The
 * line is the shared Russian wording (`VALIDATION_TERMS`, CR-194) — never a
 * schema's English. */
export const WithError: Story = {
  args: { error: VALIDATION_TERMS.required, defaultValue: '' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Место старта');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(VALIDATION_TERMS.required);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      VALIDATION_TERMS.required,
    );
    await expect(
      canvas.queryByText('Где группа собирается перед стартом'),
    ).toBeNull();
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Воробьёвы горы' },
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByLabelText('Место старта');
    await expect(input).toBeDisabled();
    await userEvent.type(input, 'x');
    await expect(input).toHaveValue('Воробьёвы горы');
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/** While the form's data loads the field is a skeleton (`docs/design.md`
 * §10) — the label stays, so the layout doesn't jump. */
export const Loading: Story = {
  render: ({ label }) => (
    <div className="flex max-w-sm flex-col gap-1.5" aria-busy="true">
      <span className="text-body-sm font-medium text-text">{label}</span>
      <Skeleton className="h-11 rounded-lg" />
    </div>
  ),
};

function AllStates() {
  return (
    <div className="grid max-w-sm gap-5">
      <FormField id="story-default" label="Место старта" hint="Подсказка">
        <Input placeholder="Например, Воробьёвы горы" />
      </FormField>
      <FormField
        id="story-error"
        label="Дистанция, км"
        error={VALIDATION_TERMS.number}
      >
        <Input defaultValue="сто" />
      </FormField>
      <FormField id="story-disabled" label="Организатор">
        <Input disabled defaultValue="Велоклуб «Утро»" />
      </FormField>
    </div>
  );
}

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => <AllStates />,
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
  render: () => <AllStates />,
};
