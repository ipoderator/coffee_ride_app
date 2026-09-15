'use client';

import { useState } from 'react';
import { createStopRequestSchema, type CreateStopRequest } from 'types';
import { Button, Card, STOPS_TERMS } from 'ui';
import {
  ApiError,
  createStop,
  deleteStop,
  updateStop,
  type Stop,
} from '../api';

type FieldErrors = Partial<
  Record<'name' | 'description' | 'lat' | 'lng' | 'durationMinutes', string>
>;

type FormState = {
  name: string;
  description: string;
  lat: string;
  lng: string;
  durationMinutes: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  lat: '',
  lng: '',
  durationMinutes: '',
};

function toRequestPayload(form: FormState): unknown {
  return {
    name: form.name.trim(),
    description:
      form.description.trim() === '' ? null : form.description.trim(),
    lat: Number(form.lat),
    lng: Number(form.lng),
    durationMinutes:
      form.durationMinutes.trim() === '' ? null : Number(form.durationMinutes),
  };
}

function stopToForm(stop: Stop): FormState {
  return {
    name: stop.name,
    description: stop.description ?? '',
    lat: String(stop.lat),
    lng: String(stop.lng),
    durationMinutes:
      stop.durationMinutes === null ? '' : String(stop.durationMinutes),
  };
}

/**
 * `/organizer/rides/[id]/route`'s stops management, rendered alongside
 * `RouteUploadForm` (`docs/design.md` §8 groups them on one screen). Draft-only, same
 * gate as GPX upload — `resolveOwnDraftRide` server-side backs every mutation here.
 * `position` is never editable (`.claude/context/current-task.md`: server-assigned,
 * no reorder support in this ticket) — a new stop always appends at the end, and the
 * list itself is always shown in the server's own `position` order.
 */
export function StopsSection({
  rideId,
  stops,
  isDraft,
  onChange,
}: {
  rideId: string;
  stops: Stop[];
  isDraft: boolean;
  onChange: () => void | Promise<void>;
}) {
  const [addForm, setAddForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function applyValidationErrors(payload: unknown): FieldErrors | null {
    const parsed = createStopRequestSchema.safeParse(payload);
    if (parsed.success) return null;
    const next: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        field === 'name' ||
        field === 'description' ||
        field === 'lat' ||
        field === 'lng' ||
        field === 'durationMinutes'
      ) {
        next[field] ??= issue.message;
      }
    }
    return next;
  }

  function handleApiError(error: unknown) {
    if (
      error instanceof ApiError &&
      error.problem.code === 'validation_error' &&
      error.problem.errors
    ) {
      const next: FieldErrors = {};
      for (const issue of error.problem.errors) {
        if (
          issue.path === 'name' ||
          issue.path === 'description' ||
          issue.path === 'lat' ||
          issue.path === 'lng' ||
          issue.path === 'durationMinutes'
        ) {
          next[issue.path] ??= issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    setFormError(STOPS_TERMS.loadError);
  }

  async function handleCreate() {
    if (!addForm || isPending) return;
    const payload = toRequestPayload(addForm);
    const errors = applyValidationErrors(payload);
    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);
    try {
      await createStop(rideId, payload as CreateStopRequest);
      setAddForm(null);
      setSuccessMessage(STOPS_TERMS.saveSuccess);
      await onChange();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleUpdate(stopId: string) {
    if (isPending) return;
    const payload = toRequestPayload(editForm);
    const errors = applyValidationErrors(payload);
    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsPending(true);
    try {
      await updateStop(rideId, stopId, payload as CreateStopRequest);
      setEditingId(null);
      setSuccessMessage(STOPS_TERMS.saveSuccess);
      await onChange();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(stopId: string) {
    if (isPending) return;
    if (!window.confirm(STOPS_TERMS.deleteConfirm)) return;

    setFormError(null);
    setIsPending(true);
    try {
      await deleteStop(rideId, stopId);
      setSuccessMessage(STOPS_TERMS.deleteSuccess);
      await onChange();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsPending(false);
    }
  }

  function renderForm(
    form: FormState,
    setForm: (form: FormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
  ) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border-input p-4">
        <label className="flex flex-col gap-1 text-sm text-text">
          {STOPS_TERMS.nameLabel}
          <input
            className="rounded-md border border-border-input px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={isPending}
          />
          {fieldErrors.name && (
            <span className="text-sm text-danger">{fieldErrors.name}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          {STOPS_TERMS.descriptionLabel}
          <input
            className="rounded-md border border-border-input px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={isPending}
          />
          {fieldErrors.description && (
            <span className="text-sm text-danger">
              {fieldErrors.description}
            </span>
          )}
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm text-text">
            {STOPS_TERMS.latLabel}
            <input
              className="rounded-md border border-border-input px-3 py-2 text-sm"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
              disabled={isPending}
              inputMode="decimal"
            />
            {fieldErrors.lat && (
              <span className="text-sm text-danger">{fieldErrors.lat}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm text-text">
            {STOPS_TERMS.lngLabel}
            <input
              className="rounded-md border border-border-input px-3 py-2 text-sm"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
              disabled={isPending}
              inputMode="decimal"
            />
            {fieldErrors.lng && (
              <span className="text-sm text-danger">{fieldErrors.lng}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm text-text">
            {STOPS_TERMS.durationLabel}
            <input
              className="rounded-md border border-border-input px-3 py-2 text-sm"
              value={form.durationMinutes}
              onChange={(e) =>
                setForm({ ...form, durationMinutes: e.target.value })
              }
              disabled={isPending}
              inputMode="numeric"
            />
            {fieldErrors.durationMinutes && (
              <span className="text-sm text-danger">
                {fieldErrors.durationMinutes}
              </span>
            )}
          </label>
        </div>
        <div className="flex gap-3">
          <Button type="button" isLoading={isPending} onClick={onSubmit}>
            {STOPS_TERMS.save}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={onCancel}
          >
            {STOPS_TERMS.cancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-medium text-text">
        {STOPS_TERMS.sectionTitle}
      </p>

      {!isDraft && (
        <p role="status" className="text-sm text-warning">
          {STOPS_TERMS.notEditable}
        </p>
      )}

      {stops.length === 0 && !addForm && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text">
            {STOPS_TERMS.emptyTitle}
          </p>
          <p className="text-sm text-text-secondary">
            {STOPS_TERMS.emptyDescription}
          </p>
        </div>
      )}

      {stops.length > 0 && (
        <ul className="flex flex-col gap-3">
          {stops.map((stop) =>
            editingId === stop.id ? (
              <li key={stop.id}>
                {renderForm(
                  editForm,
                  setEditForm,
                  () => handleUpdate(stop.id),
                  () => {
                    setEditingId(null);
                    setFieldErrors({});
                  },
                )}
              </li>
            ) : (
              <li
                key={stop.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-none last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text">{stop.name}</p>
                  {isDraft && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => {
                          setEditingId(stop.id);
                          setEditForm(stopToForm(stop));
                          setFieldErrors({});
                        }}
                      >
                        {STOPS_TERMS.edit}
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-danger hover:underline"
                        onClick={() => handleDelete(stop.id)}
                      >
                        {STOPS_TERMS.delete}
                      </button>
                    </div>
                  )}
                </div>
                {stop.description && (
                  <p className="text-sm text-text-secondary">
                    {stop.description}
                  </p>
                )}
                <p className="text-sm text-text-secondary">
                  {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
                  {stop.durationMinutes !== null &&
                    ` · ${stop.durationMinutes} мин`}
                </p>
              </li>
            ),
          )}
        </ul>
      )}

      {isDraft &&
        (addForm ? (
          renderForm(addForm, setAddForm, handleCreate, () => {
            setAddForm(null);
            setFieldErrors({});
          })
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => {
              setAddForm(EMPTY_FORM);
              setFieldErrors({});
              setFormError(null);
            }}
          >
            {STOPS_TERMS.addButton}
          </Button>
        ))}

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      {successMessage && !formError && (
        <p role="status" className="text-sm text-success">
          {successMessage}
        </p>
      )}
    </Card>
  );
}
