'use client';

import {
  RIDE_CONTACT_TYPES,
  type RideContact,
  type RideContactType,
} from 'types';
import { FormField, Input, RIDE_CONTACT_TYPE_TERMS, RIDE_EDIT_TERMS } from 'ui';

/**
 * CR-165: the optional «Способ связи с организатором» pair — a type select plus
 * the value input it governs.
 *
 * Shared by the create wizard and the edit form rather than duplicated in each
 * (`.claude/rules/extensibility.md`: shared logic is extracted, not copied
 * between feature surfaces). The empty-string select value is "не указывать",
 * which is also the default — the field is genuinely optional, so no contact is
 * a first-class state rather than an empty string smuggled through.
 */
export interface RideContactDraft {
  /** `''` = «Не указывать». */
  type: RideContactType | '';
  value: string;
}

export const EMPTY_RIDE_CONTACT: RideContactDraft = { type: '', value: '' };

export function rideContactFromResponse(
  contact: RideContact | undefined,
): RideContactDraft {
  return contact
    ? { type: contact.type, value: contact.value }
    : EMPTY_RIDE_CONTACT;
}

/**
 * The draft as the API wants it: `null` when no type is chosen (clears any stored
 * contact), otherwise the raw pair — `packages/types`' `rideContactSchema`
 * normalizes the value server-side, so the form deliberately does not pre-format
 * what the organizer typed.
 */
export function rideContactToRequest(
  draft: RideContactDraft,
): { type: RideContactType; value: string } | null {
  if (!draft.type) return null;
  return { type: draft.type, value: draft.value.trim() };
}

const PLACEHOLDERS: Record<RideContactType, string> = {
  phone: RIDE_EDIT_TERMS.contactPlaceholderPhone,
  telegram: RIDE_EDIT_TERMS.contactPlaceholderTelegram,
  max: RIDE_EDIT_TERMS.contactPlaceholderMax,
  email: RIDE_EDIT_TERMS.contactPlaceholderEmail,
};

function selectClassName(hasError: boolean): string {
  return [
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-body text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

export function RideContactFields({
  idPrefix,
  value,
  onChange,
  disabled = false,
  error,
  hint = RIDE_EDIT_TERMS.contactHint,
}: {
  /** Distinguishes the create form's ids from the edit form's. */
  idPrefix: string;
  value: RideContactDraft;
  onChange: (next: RideContactDraft) => void;
  disabled?: boolean;
  error?: string;
  /**
   * KI-081: the edit form overrides this after publish, where the contact is
   * the one field that stays editable. Optional with the create wizard's
   * wording as the default (`.claude/rules/extensibility.md`: a new shared-
   * component prop is additive, never a required change at every call site).
   */
  hint?: string;
}) {
  return (
    <>
      <FormField
        id={`${idPrefix}-contact-type`}
        label={RIDE_EDIT_TERMS.contactTypeLabel}
        hint={hint}
      >
        <select
          id={`${idPrefix}-contact-type`}
          value={value.type}
          onChange={(event) =>
            onChange({
              type: event.target.value as RideContactType | '',
              // Clearing the type clears the value too: a stale handle left
              // behind under a different type would fail validation in a way
              // the organizer didn't ask for.
              value: event.target.value ? value.value : '',
            })
          }
          disabled={disabled}
          className={selectClassName(false)}
        >
          <option value="">{RIDE_EDIT_TERMS.contactNone}</option>
          {RIDE_CONTACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {RIDE_CONTACT_TYPE_TERMS[type]}
            </option>
          ))}
        </select>
      </FormField>

      {value.type ? (
        <FormField
          id={`${idPrefix}-contact-value`}
          label={RIDE_EDIT_TERMS.contactValueLabel}
          error={error}
        >
          <Input
            id={`${idPrefix}-contact-value`}
            value={value.value}
            onChange={(event) =>
              onChange({ ...value, value: event.target.value })
            }
            placeholder={PLACEHOLDERS[value.type]}
            disabled={disabled}
            inputMode={
              value.type === 'phone' || value.type === 'max'
                ? 'tel'
                : value.type === 'email'
                  ? 'email'
                  : 'text'
            }
            aria-invalid={error ? true : undefined}
          />
        </FormField>
      ) : null}
    </>
  );
}
