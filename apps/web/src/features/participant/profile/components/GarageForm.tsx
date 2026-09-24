'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BIKE_TYPES, type Bike, type BikeType } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  GARAGE_TERMS as T,
  Input,
  Skeleton,
} from 'ui';
import {
  ApiError,
  createBike,
  createBikeRequestSchema,
  deleteBike,
  listBikes,
  updateBike,
  updateBikeRequestSchema,
  type CreateBikeRequest,
  type UpdateBikeRequest,
} from '../api';

type Status = 'loading' | 'ready' | 'error';
type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };
type Busy = null | 'save' | 'delete' | { activating: string };

interface BikeFormState {
  bikeType: BikeType;
  brand: string;
  model: string;
}

interface FieldErrors {
  bikeType?: string;
  brand?: string;
  model?: string;
}

const EMPTY_FORM: BikeFormState = { bikeType: 'road', brand: '', model: '' };

function selectClassName(hasError: boolean): string {
  return [
    'min-h-11 w-full rounded-lg border bg-bg-raised px-3 text-base text-text',
    hasError ? 'border-danger' : 'border-border-input',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    'disabled:cursor-not-allowed disabled:opacity-60',
  ].join(' ');
}

// Empty ⇒ explicit `null` (clears it) — same convention `ProfileForm`'s
// `toPatchValue` uses for `phone`/`bio`.
function toNullable(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bikeLabel(bike: Bike): string {
  const parts = [bike.brand, bike.model].filter((part): part is string =>
    Boolean(part),
  );
  return parts.length > 0 ? parts.join(' ') : BICYCLE_TYPE_TERMS[bike.bikeType];
}

/**
 * `/me/profile`'s "garage" (CR-126): list, add, edit, delete the participant's
 * bikes and mark one active. Same add/edit/delete/list shape as `GroupsEditor`
 * (CR-120) — no reordering here, and the list is refetched wholesale after
 * every mutation rather than reconciled locally: a garage realistically holds
 * a handful of bikes (capped at 20 server-side), so that's simpler and just as
 * correct as tracking the "only one bike is active" invariant client-side.
 */
export function GarageForm() {
  const [status, setStatus] = useState<Status>('loading');
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [form, setForm] = useState<BikeFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bike | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    listBikes()
      .then((response) => {
        if (cancelled) return;
        setBikes(response.items);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(async () => {
    const response = await listBikes();
    setBikes(response.items);
  }, []);

  const isBusy = busy !== null;

  function clearMessages() {
    setFieldErrors({});
    setFormError(null);
    setListError(null);
    setSuccess(null);
  }

  function handleError(error: unknown, where: 'form' | 'list') {
    const code = error instanceof ApiError ? error.problem.code : null;
    const show = where === 'form' ? setFormError : setListError;
    switch (code) {
      case 'bike_limit_reached':
        show(T.bikeLimitReached);
        return;
      case 'bike_not_found':
        // Someone else (another tab) removed it meanwhile — resync the list.
        show(T.genericError);
        setMode({ kind: 'idle' });
        void refresh().catch(() => undefined);
        return;
      default:
        show(T.genericError);
    }
  }

  function openAdd() {
    clearMessages();
    setForm(EMPTY_FORM);
    setMode({ kind: 'add' });
  }

  function openEdit(bike: Bike) {
    clearMessages();
    setForm({
      bikeType: bike.bikeType,
      brand: bike.brand ?? '',
      model: bike.model ?? '',
    });
    setMode({ kind: 'edit', id: bike.id });
  }

  function closeForm() {
    setFieldErrors({});
    setFormError(null);
    setMode({ kind: 'idle' });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || mode.kind === 'idle') return;

    const payload = {
      bikeType: form.bikeType,
      brand: toNullable(form.brand),
      model: toNullable(form.model),
    };
    const schema =
      mode.kind === 'add' ? createBikeRequestSchema : updateBikeRequestSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'bikeType' || field === 'brand' || field === 'model') {
          nextErrors[field] ??= issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    clearMessages();
    setBusy('save');
    try {
      if (mode.kind === 'add') {
        await createBike(parsed.data as CreateBikeRequest);
        setSuccess(T.createSuccess);
      } else {
        await updateBike(mode.id, parsed.data as UpdateBikeRequest);
        setSuccess(T.updateSuccess);
      }
      setMode({ kind: 'idle' });
      await refresh();
    } catch (error) {
      handleError(error, 'form');
    } finally {
      setBusy(null);
    }
  }

  async function handleActivate(bike: Bike) {
    if (isBusy || bike.isActive) return;
    clearMessages();
    setBusy({ activating: bike.id });
    try {
      await updateBike(bike.id, { isActive: true });
      await refresh();
    } catch (error) {
      handleError(error, 'list');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || isBusy) return;
    clearMessages();
    setBusy('delete');
    try {
      await deleteBike(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess(T.deleteSuccess);
      await refresh();
    } catch (error) {
      setDeleteTarget(null);
      handleError(error, 'list');
    } finally {
      setBusy(null);
    }
  }

  const formNode =
    mode.kind === 'idle' ? null : (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label={mode.kind === 'add' ? T.addTitle : T.editTitle}
        className="flex flex-col gap-4 rounded-md border-[1.5px] border-frame p-4"
      >
        <p className="text-base font-semibold text-text">
          {mode.kind === 'add' ? T.addTitle : T.editTitle}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            id="bike-type"
            label={T.bikeTypeLabel}
            error={fieldErrors.bikeType}
          >
            <select
              value={form.bikeType}
              onChange={(event) =>
                setForm({ ...form, bikeType: event.target.value as BikeType })
              }
              disabled={busy === 'save'}
              className={selectClassName(Boolean(fieldErrors.bikeType))}
            >
              {BIKE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BICYCLE_TYPE_TERMS[type]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            id="bike-brand"
            label={T.brandLabel}
            error={fieldErrors.brand}
          >
            <Input
              type="text"
              autoComplete="off"
              value={form.brand}
              onChange={(event) =>
                setForm({ ...form, brand: event.target.value })
              }
              disabled={busy === 'save'}
            />
          </FormField>
          <FormField
            id="bike-model"
            label={T.modelLabel}
            error={fieldErrors.model}
          >
            <Input
              type="text"
              autoComplete="off"
              value={form.model}
              onChange={(event) =>
                setForm({ ...form, model: event.target.value })
              }
              disabled={busy === 'save'}
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" isLoading={busy === 'save'}>
            {busy === 'save'
              ? T.pending
              : mode.kind === 'add'
                ? T.create
                : T.save}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy === 'save'}
            onClick={closeForm}
          >
            {T.cancel}
          </Button>
        </div>
      </form>
    );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-text">
          {T.sectionTitle}
        </h2>
        <p className="text-sm text-text-secondary">{T.hint}</p>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-2" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          message={T.loadError}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}

      {status === 'ready' && bikes.length === 0 && mode.kind !== 'add' && (
        <EmptyState title={T.emptyTitle} description={T.emptyDescription} />
      )}

      {status === 'ready' && bikes.length > 0 && (
        <ul className="flex flex-col">
          {bikes.map((bike) => {
            if (mode.kind === 'edit' && mode.id === bike.id) {
              return (
                <li key={bike.id} className="py-3">
                  {formNode}
                </li>
              );
            }
            const label = bikeLabel(bike);
            const isActivating =
              typeof busy === 'object' &&
              busy !== null &&
              busy.activating === bike.id;
            return (
              <li
                key={bike.id}
                className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-none last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-base font-semibold text-text">{label}</p>
                  <p className="text-sm text-text-secondary">
                    {BICYCLE_TYPE_TERMS[bike.bikeType]}
                    {bike.isActive && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-medium text-primary">
                          {T.activeLabel}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!bike.isActive && (
                    <Button
                      variant="secondary"
                      className="px-3"
                      aria-label={T.makeActiveAria(label)}
                      disabled={isBusy}
                      isLoading={isActivating}
                      onClick={() => handleActivate(bike)}
                    >
                      {T.makeActiveButton}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    className="px-3"
                    aria-label={T.editAria(label)}
                    disabled={isBusy}
                    onClick={() => openEdit(bike)}
                  >
                    {T.edit}
                  </Button>
                  <Button
                    variant="danger"
                    className="px-3"
                    aria-label={T.deleteAria(label)}
                    disabled={isBusy}
                    onClick={() => {
                      clearMessages();
                      setDeleteTarget(bike);
                    }}
                  >
                    {T.delete}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mode.kind === 'add' && formNode}

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      {status === 'ready' && mode.kind === 'idle' && (
        <Button variant="secondary" className="self-start" onClick={openAdd}>
          {T.addButton}
        </Button>
      )}

      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      {success && !formError && !listError && (
        <p role="status" className="text-sm text-success">
          {success}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => {
          if (busy !== 'delete') setDeleteTarget(null);
        }}
        onConfirm={handleDelete}
        title={
          deleteTarget ? T.deleteConfirmTitle(bikeLabel(deleteTarget)) : ''
        }
        description={T.deleteConfirmDescription}
        confirmLabel={T.deleteConfirmAction}
        cancelLabel={T.cancel}
        isConfirming={busy === 'delete'}
      />
    </Card>
  );
}
