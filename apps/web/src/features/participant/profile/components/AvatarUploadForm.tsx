'use client';

import { useRef, useState } from 'react';
import { Avatar, AVATAR_TERMS, Button, Card, ErrorState } from 'ui';
import { apiAssetUrl } from '@/lib/api/asset-url';
import { ApiError, deleteAvatar, replaceAvatar, uploadAvatar } from '../api';

/**
 * `/me/profile` (CR-097, KI-023 remainder, `docs/design.md` §9 "Avatar"). Same
 * 3-verb shape as `features/organizer/cover-image/components/
 * CoverImageUploadForm`, minus a draft-only gate — a `User`'s avatar has no
 * draft state to check, so upload/replace/delete are always available.
 * `initialAvatarUrl`/`name` come from `useCurrentUser()` in the parent page —
 * no separate load fetch, unlike the ride cover form.
 */
export function AvatarUploadForm({
  initialAvatarUrl,
  name,
}: {
  initialAvatarUrl: string | null;
  name: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [formError, setFormError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetMessages() {
    setFormError(null);
    setStorageUnavailable(false);
    setSuccessMessage(null);
  }

  function handleError(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError(AVATAR_TERMS.genericError);
      return;
    }
    switch (error.problem.code) {
      case 'avatar_missing':
        setFormError(AVATAR_TERMS.avatarMissing);
        break;
      case 'avatar_invalid':
        setFormError(AVATAR_TERMS.avatarInvalid);
        break;
      case 'avatar_too_large':
        setFormError(AVATAR_TERMS.avatarTooLarge);
        break;
      case 'avatar_storage_unavailable':
        // `.claude/rules/resilience.md`'s degraded state — an inline warning,
        // never a hard failure blocking the rest of the profile form.
        setStorageUnavailable(true);
        break;
      default:
        setFormError(AVATAR_TERMS.genericError);
    }
  }

  async function handleUpload() {
    if (isPending) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setFormError(AVATAR_TERMS.avatarMissing);
      return;
    }

    resetMessages();
    setIsPending(true);
    try {
      const isReplace = avatarUrl !== null;
      const url = isReplace
        ? await replaceAvatar(file)
        : await uploadAvatar(file);
      // Cache-bust: the path itself never changes (`/v1/users/me/avatar`), so
      // the browser needs a fresh query param to notice a replaced image —
      // same reasoning as `CoverImageUploadForm`.
      setAvatarUrl(`${url}?v=${Date.now()}`);
      setSuccessMessage(
        isReplace ? AVATAR_TERMS.replaceSuccess : AVATAR_TERMS.uploadSuccess,
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      handleError(error);
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    if (isPending) return;
    if (!window.confirm(AVATAR_TERMS.deleteConfirm)) return;

    resetMessages();
    setIsPending(true);
    try {
      await deleteAvatar();
      setAvatarUrl(null);
      setSuccessMessage(AVATAR_TERMS.deleteSuccess);
    } catch (error) {
      handleError(error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar
          src={avatarUrl ? apiAssetUrl(avatarUrl) : null}
          name={name}
          size="lg"
        />
        {!avatarUrl && (
          <p className="text-sm text-text-secondary">
            {AVATAR_TERMS.emptyDescription}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="avatar-file" className="text-sm font-medium text-text">
          {AVATAR_TERMS.uploadLabel}
        </label>
        <input
          id="avatar-file"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          className="text-sm text-text"
        />
      </div>

      {storageUnavailable && (
        <ErrorState
          message={AVATAR_TERMS.storageUnavailable}
          tone="warning"
          variant="inline"
        />
      )}

      {formError && !storageUnavailable && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}

      {successMessage && !formError && !storageUnavailable && (
        <p role="status" className="text-sm text-success">
          {successMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          isLoading={isPending}
          onClick={handleUpload}
          className="self-start"
        >
          {isPending
            ? AVATAR_TERMS.uploadPending
            : avatarUrl
              ? AVATAR_TERMS.replace
              : AVATAR_TERMS.upload}
        </Button>
        {avatarUrl && (
          <Button
            type="button"
            variant="danger"
            isLoading={isPending}
            onClick={handleDelete}
            className="self-start"
          >
            {AVATAR_TERMS.delete}
          </Button>
        )}
      </div>
    </Card>
  );
}
