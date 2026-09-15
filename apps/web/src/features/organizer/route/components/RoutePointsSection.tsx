'use client';

import { useState } from 'react';
import {
  createRoutePointRequestSchema,
  ROUTE_POINT_TYPES,
  type CreateRoutePointRequest,
  type RoutePointType,
} from 'types';
import { Button, Card, ROUTE_POINT_TERMS, ROUTE_POINT_TYPE_TERMS } from 'ui';
import {
  ApiError,
  createRoutePoint,
  deleteRoutePoint,
  updateRoutePoint,
  type RoutePoint,
} from '../api';

type FieldErrors = Partial<
  Record<'type' | 'label' | 'description' | 'lat' | 'lng', string>
>;

type FormState = {
  type: RoutePointType;
  label: string;
  description: string;
  lat: string;
  lng: string;
};

const EMPTY_FORM: FormState = {
  type: 'stop',
  label: '',
  description: '',
  lat: '',
  lng: '',
};

function toRequestPayload(form: FormState): unknown {
  return {
    type: form.type,
    label: form.label.trim() === '' ? null : form.label.trim(),
    description:
      form.description.trim() === '' ? null : form.description.trim(),
    lat: Number(form.lat),
    lng: Number(form.lng),
  };
}

function routePointToForm(routePoint: RoutePoint): FormState {
  return {
    type: routePoint.type,
    label: routePoint.label ?? '',
    description: routePoint.description ?? '',
    lat: String(routePoint.lat),
    lng: String(routePoint.lng),
  };
}

/**
 * `/organizer/rides/[id]/route`'s route-points management, rendered alongside
 * `StopsSection` (`docs/design.md` §8 groups them on one screen). Draft-only, same
 * gate as GPX upload/stops — `resolveOwnDraftRide` server-side backs every mutation
 * here. No `position`/reorder concept — a route point is a typed map pin, not an
 * ordered itinerary entry (`.claude/context/current-task.md`), so the list is shown in
 * the server's own `createdAt` order with no manual reordering UI.
 */
export function RoutePointsSection({
  rideId,
  routePoints,
  isDraft,
  onChange,
}: {
  rideId: string;
  routePoints: RoutePoint[];
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
    const parsed = createRoutePointRequestSchema.safeParse(payload);
    if (parsed.success) return null;
    const next: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        field === 'type' ||
        field === 'label' ||
        field === 'description' ||
        field === 'lat' ||
        field === 'lng'
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
          issue.path === 'type' ||
          issue.path === 'label' ||
          issue.path === 'description' ||
          issue.path === 'lat' ||
          issue.path === 'lng'
        ) {
          next[issue.path] ??= issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    setFormError(ROUTE_POINT_TERMS.loadError);
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
      await createRoutePoint(rideId, payload as CreateRoutePointRequest);
      setAddForm(null);
      setSuccessMessage(ROUTE_POINT_TERMS.saveSuccess);
      await onChange();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleUpdate(routePointId: string) {
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
      await updateRoutePoint(
        rideId,
        routePointId,
        payload as CreateRoutePointRequest,
      );
      setEditingId(null);
      setSuccessMessage(ROUTE_POINT_TERMS.saveSuccess);
      await onChange();
    } catch (error) {
      handleApiError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(routePointId: string) {
    if (isPending) return;
    if (!window.confirm(ROUTE_POINT_TERMS.deleteConfirm)) return;

    setFormError(null);
    setIsPending(true);
    try {
      await deleteRoutePoint(rideId, routePointId);
      setSuccessMessage(ROUTE_POINT_TERMS.deleteSuccess);
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
          {ROUTE_POINT_TERMS.typeLabel}
          <select
            className="rounded-md border border-border-input px-3 py-2 text-sm"
            value={form.type}
            onChange={(e) =>
              setForm({ ...form, type: e.target.value as RoutePointType })
            }
            disabled={isPending}
          >
            {ROUTE_POINT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ROUTE_POINT_TYPE_TERMS[type]}
              </option>
            ))}
          </select>
          {fieldErrors.type && (
            <span className="text-sm text-danger">{fieldErrors.type}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          {ROUTE_POINT_TERMS.labelLabel}
          <input
            className="rounded-md border border-border-input px-3 py-2 text-sm"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            disabled={isPending}
          />
          {fieldErrors.label && (
            <span className="text-sm text-danger">{fieldErrors.label}</span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          {ROUTE_POINT_TERMS.descriptionLabel}
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
            {ROUTE_POINT_TERMS.latLabel}
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
            {ROUTE_POINT_TERMS.lngLabel}
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
        </div>
        <div className="flex gap-3">
          <Button type="button" isLoading={isPending} onClick={onSubmit}>
            {ROUTE_POINT_TERMS.save}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={onCancel}
          >
            {ROUTE_POINT_TERMS.cancel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-sm font-medium text-text">
        {ROUTE_POINT_TERMS.sectionTitle}
      </p>

      {!isDraft && (
        <p role="status" className="text-sm text-warning">
          {ROUTE_POINT_TERMS.notEditable}
        </p>
      )}

      {routePoints.length === 0 && !addForm && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text">
            {ROUTE_POINT_TERMS.emptyTitle}
          </p>
          <p className="text-sm text-text-secondary">
            {ROUTE_POINT_TERMS.emptyDescription}
          </p>
        </div>
      )}

      {routePoints.length > 0 && (
        <ul className="flex flex-col gap-3">
          {routePoints.map((routePoint) =>
            editingId === routePoint.id ? (
              <li key={routePoint.id}>
                {renderForm(
                  editForm,
                  setEditForm,
                  () => handleUpdate(routePoint.id),
                  () => {
                    setEditingId(null);
                    setFieldErrors({});
                  },
                )}
              </li>
            ) : (
              <li
                key={routePoint.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-none last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-text">
                    {ROUTE_POINT_TYPE_TERMS[routePoint.type]}
                    {routePoint.label && ` · ${routePoint.label}`}
                  </p>
                  {isDraft && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-primary hover:underline"
                        onClick={() => {
                          setEditingId(routePoint.id);
                          setEditForm(routePointToForm(routePoint));
                          setFieldErrors({});
                        }}
                      >
                        {ROUTE_POINT_TERMS.edit}
                      </button>
                      <button
                        type="button"
                        className="text-sm font-medium text-danger hover:underline"
                        onClick={() => handleDelete(routePoint.id)}
                      >
                        {ROUTE_POINT_TERMS.delete}
                      </button>
                    </div>
                  )}
                </div>
                {routePoint.description && (
                  <p className="text-sm text-text-secondary">
                    {routePoint.description}
                  </p>
                )}
                <p className="text-sm text-text-secondary">
                  {routePoint.lat.toFixed(6)}, {routePoint.lng.toFixed(6)}
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
            {ROUTE_POINT_TERMS.addButton}
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
