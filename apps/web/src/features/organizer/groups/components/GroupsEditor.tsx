'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { RIDE_GROUP_MAX_PER_RIDE, type RideStatus } from 'types';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ORGANIZER_GROUPS_TERMS as T,
  RIDE_EDIT_TERMS,
  Skeleton,
  formatGroupPaceParts,
} from 'ui';
import {
  ApiError,
  createRideGroup,
  deleteRideGroup,
  updateRideGroup,
  type RideGroupWithCount,
} from '../api';
import { useRideGroups } from '../hooks/useRideGroups';
import type { GroupFieldErrors, GroupFormState } from '../types';
import { paceToInput, validateGroupForm } from '../validation';
import { GroupForm } from './GroupForm';

// `docs/api.md` → "Pace groups": editable in every status except these two.
const LOCKED_STATUSES: ReadonlyArray<RideStatus> = ['finished', 'cancelled'];

type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'edit'; id: string };
type Busy = null | 'save' | 'delete' | { moving: string };
type Direction = 'up' | 'down';

/** «Группа N» with the first N (from count + 1) no existing group already uses —
 * the API matches names case-insensitively, so the suggestion does too. */
function suggestName(groups: RideGroupWithCount[]): string {
  const taken = new Set(groups.map((group) => group.name.toLocaleLowerCase()));
  for (let n = groups.length + 1; ; n += 1) {
    const candidate = T.defaultName(n);
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

/**
 * `/organizer/rides/[id]/groups` (CR-120, ADR-022): list, add, edit, delete and
 * reorder a ride's pace groups. Reordering is two plain buttons per row (not
 * drag-only), each a `PATCH` with the new `position`. Every rule is re-checked
 * server-side (owner-only, ≤6, unique name, no delete while occupied, locked
 * once `finished`/`cancelled`); the UI mirrors them so the common case never
 * reaches a 409, and maps each 409 `code` to its own message when it does.
 */
export function GroupsEditor({ rideId }: { rideId: string }) {
  const { status, rideStatus, groups, refresh, retry } = useRideGroups(rideId);
  const [lockedByServer, setLockedByServer] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [form, setForm] = useState<GroupFormState>({
    name: '',
    pace: '',
    description: '',
  });
  const [fieldErrors, setFieldErrors] = useState<GroupFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [deleteTarget, setDeleteTarget] = useState<RideGroupWithCount | null>(
    null,
  );
  const [focusAfterMove, setFocusAfterMove] = useState<{
    id: string;
    direction: Direction;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keyboard users keep their place: after a move, focus follows the group to
  // its new row (same direction if it can still move that way, else the other).
  useEffect(() => {
    if (!focusAfterMove) return;
    const { id, direction } = focusAfterMove;
    const other: Direction = direction === 'up' ? 'down' : 'up';
    const find = (dir: Direction) =>
      rootRef.current?.querySelector<HTMLButtonElement>(
        `[data-move="${id}:${dir}"]`,
      );
    const same = find(direction);
    (same && !same.disabled ? same : find(other))?.focus();
    setFocusAfterMove(null);
  }, [focusAfterMove, groups]);

  const readOnly =
    lockedByServer ||
    (rideStatus !== null && LOCKED_STATUSES.includes(rideStatus));
  const isBusy = busy !== null;
  const atLimit = groups.length >= RIDE_GROUP_MAX_PER_RIDE;

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
      case 'ride_groups_not_editable':
        setLockedByServer(true);
        setMode({ kind: 'idle' });
        return;
      case 'group_name_taken':
        setFieldErrors({ name: T.groupNameTaken });
        return;
      case 'group_limit_reached':
        show(T.groupLimitReached);
        void refresh().catch(() => undefined);
        return;
      case 'group_has_registrations':
        show(T.groupHasRegistrations);
        void refresh().catch(() => undefined);
        return;
      case 'group_not_found':
        // Someone else removed it meanwhile — resync the list.
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
    setForm({ name: suggestName(groups), pace: '', description: '' });
    setMode({ kind: 'add' });
  }

  function openEdit(group: RideGroupWithCount) {
    clearMessages();
    setForm({
      name: group.name,
      pace: paceToInput(group.paceKmh),
      description: group.description ?? '',
    });
    setMode({ kind: 'edit', id: group.id });
  }

  function closeForm() {
    setFieldErrors({});
    setFormError(null);
    setMode({ kind: 'idle' });
  }

  async function handleSubmit() {
    if (isBusy || mode.kind === 'idle') return;
    const result = validateGroupForm(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      return;
    }
    clearMessages();
    setBusy('save');
    try {
      if (mode.kind === 'add') {
        await createRideGroup(rideId, result.payload);
        setSuccess(T.createSuccess);
      } else {
        await updateRideGroup(rideId, mode.id, result.payload);
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

  async function handleMove(group: RideGroupWithCount, direction: Direction) {
    if (isBusy) return;
    const index = groups.findIndex((item) => item.id === group.id);
    const position = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || position < 0 || position >= groups.length) return;
    clearMessages();
    setBusy({ moving: group.id });
    let moved = false;
    try {
      await updateRideGroup(rideId, group.id, { position });
      await refresh();
      setSuccess(T.reorderSuccess);
      moved = true;
    } catch (error) {
      handleError(error, 'list');
    } finally {
      setBusy(null);
      if (moved) setFocusAfterMove({ id: group.id, direction });
    }
  }

  async function handleDelete() {
    if (!deleteTarget || isBusy) return;
    clearMessages();
    setBusy('delete');
    try {
      await deleteRideGroup(rideId, deleteTarget.id);
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

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm font-medium text-text">
          {RIDE_EDIT_TERMS.notFoundTitle}
        </p>
        <p className="max-w-sm text-sm text-text-secondary">
          {RIDE_EDIT_TERMS.notFoundDescription}
        </p>
      </Card>
    );
  }

  if (status === 'error') {
    return <ErrorState message={T.loadError} onRetry={retry} />;
  }

  const formNode =
    mode.kind === 'idle' ? null : (
      <GroupForm
        title={mode.kind === 'add' ? T.addTitle : T.editTitle}
        form={form}
        errors={fieldErrors}
        submitLabel={mode.kind === 'add' ? T.create : T.save}
        isPending={busy === 'save'}
        onChange={setForm}
        onSubmit={handleSubmit}
        onCancel={closeForm}
      />
    );

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">{T.hint}</p>

      {readOnly && (
        <p role="status" className="text-sm text-warning">
          {T.notEditable}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        {groups.length === 0 && mode.kind !== 'add' && (
          <EmptyState
            className="py-8"
            title={T.emptyTitle}
            description={T.emptyDescription}
          />
        )}

        {groups.length > 0 && (
          <ol className="flex flex-col">
            {groups.map((group, index) => {
              if (mode.kind === 'edit' && mode.id === group.id) {
                return (
                  <li key={group.id} className="py-3">
                    {formNode}
                  </li>
                );
              }
              const pace = formatGroupPaceParts(group.paceKmh);
              const isMoving =
                typeof busy === 'object' &&
                busy !== null &&
                busy.moving === group.id;
              return (
                <li
                  key={group.id}
                  className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-none last:pb-0 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-frame text-sm font-semibold tabular-nums text-text"
                    >
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="break-words text-base font-semibold text-text">
                        {group.name}
                      </p>
                      <p className="text-sm text-text-secondary">
                        <span className="font-medium tabular-nums text-text">
                          {pace.value}
                        </span>
                        {pace.unit && (
                          <span className="text-xs"> {pace.unit}</span>
                        )}
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">
                          {T.participantsCount(group.registrationsCount)}
                        </span>
                      </p>
                      {group.description && (
                        <p className="break-words text-sm text-text-secondary">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-11 md:pl-0">
                      <Button
                        variant="secondary"
                        className="w-12 px-0 md:w-11"
                        aria-label={T.moveUpAria(group.name)}
                        disabled={isBusy || index === 0}
                        isLoading={isMoving}
                        data-move={`${group.id}:up`}
                        onClick={() => handleMove(group, 'up')}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        className="w-12 px-0 md:w-11"
                        aria-label={T.moveDownAria(group.name)}
                        disabled={isBusy || index === groups.length - 1}
                        isLoading={isMoving}
                        data-move={`${group.id}:down`}
                        onClick={() => handleMove(group, 'down')}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3"
                        aria-label={T.editAria(group.name)}
                        disabled={isBusy}
                        onClick={() => openEdit(group)}
                      >
                        {T.edit}
                      </Button>
                      <Button
                        variant="danger"
                        className="px-3"
                        aria-label={T.deleteAria(group.name)}
                        disabled={isBusy}
                        onClick={() => {
                          clearMessages();
                          setDeleteTarget(group);
                        }}
                      >
                        {T.delete}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {mode.kind === 'add' && formNode}

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}

        {!readOnly && mode.kind === 'idle' && !atLimit && (
          <Button
            variant="secondary"
            className="self-start"
            disabled={isBusy}
            onClick={openAdd}
          >
            {T.addButton}
          </Button>
        )}
        {!readOnly && atLimit && mode.kind !== 'edit' && (
          <p className="text-sm text-text-secondary">{T.limitNotice}</p>
        )}
      </Card>

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
        title={deleteTarget ? T.deleteConfirmTitle(deleteTarget.name) : ''}
        description={T.deleteConfirmDescription}
        confirmLabel={T.deleteConfirmAction}
        cancelLabel={T.cancel}
        isConfirming={busy === 'delete'}
      />
    </div>
  );
}
