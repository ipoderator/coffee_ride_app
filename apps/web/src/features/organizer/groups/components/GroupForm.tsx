'use client';

import type { FormEvent } from 'react';
import {
  Button,
  FormField,
  Input,
  ORGANIZER_GROUPS_TERMS as T,
  Textarea,
} from 'ui';
import type { GroupFieldErrors, GroupFormState } from '../types';

/**
 * CR-120: the add/edit form for one pace group. Presentational — validation,
 * submission and server-error mapping live in `GroupsEditor`. Pace is a text
 * field with `inputMode="decimal"`, not `type="number"`: a number input rejects
 * the Russian decimal comma («27,5») in some browsers, which is exactly what an
 * organizer here types.
 */
export function GroupForm({
  title,
  form,
  errors,
  submitLabel,
  isPending,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  form: GroupFormState;
  errors: GroupFieldErrors;
  submitLabel: string;
  isPending: boolean;
  onChange: (form: GroupFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={title}
      className="flex flex-col gap-4 rounded-md border-[1.5px] border-frame p-4"
    >
      <p className="text-base font-semibold text-text">{title}</p>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <FormField id="group-name" label={T.nameLabel} error={errors.name}>
          <Input
            type="text"
            value={form.name}
            autoComplete="off"
            onChange={(event) =>
              onChange({ ...form, name: event.target.value })
            }
            disabled={isPending}
          />
        </FormField>
        <FormField
          id="group-pace"
          label={T.paceLabel}
          hint={T.paceHint}
          error={errors.pace}
        >
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="tabular-nums"
            value={form.pace}
            onChange={(event) =>
              onChange({ ...form, pace: event.target.value })
            }
            disabled={isPending}
          />
        </FormField>
      </div>
      <FormField
        id="group-description"
        label={T.descriptionLabel}
        hint={T.descriptionHint}
        error={errors.description}
      >
        <Textarea
          rows={2}
          value={form.description}
          onChange={(event) =>
            onChange({ ...form, description: event.target.value })
          }
          disabled={isPending}
        />
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={isPending}>
          {isPending ? T.pending : submitLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={onCancel}
        >
          {T.cancel}
        </Button>
      </div>
    </form>
  );
}
