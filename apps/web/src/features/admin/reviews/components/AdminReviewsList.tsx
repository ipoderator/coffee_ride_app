'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminReviewListItem } from 'types';
import {
  ADMIN_TERMS,
  Button,
  Card,
  SegmentedControl,
  StatusBadge,
  useToast,
} from 'ui';
import { AdminListBody } from '@/components/admin/AdminListBody';
import {
  AdminReasonDialog,
  type AdminReasonSubjectLine,
} from '@/components/admin/AdminReasonDialog';
import { adminActionErrorMessage } from '@/lib/admin/errors';
import { formatAdminDateTime } from '@/lib/admin/format';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminUrlFilters } from '@/lib/admin/use-admin-url-filters';
import { ADMIN_VISIBILITY_OPTIONS } from '@/lib/admin/visibility';
import { hideAdminReview, listAdminReviews, unhideAdminReview } from '../api';
import { REVIEWS_FILTER_DEFAULTS, parseReviewsFilters } from '../filters';

/**
 * CR-231 (ADR-032): `/admin/reviews` — every review, newest first. Hiding one
 * takes it off the ride page and out of the organizer's rating; it can be
 * brought back.
 */
export function AdminReviewsList() {
  const { showToast } = useToast();
  // CR-232: `?visibility=` — the URL is the filter's only copy.
  const [{ visibility }, setFilters] = useAdminUrlFilters(
    parseReviewsFilters,
    REVIEWS_FILTER_DEFAULTS,
  );
  const { state, loadMore, replace, retry } = useAdminList<AdminReviewListItem>(
    visibility,
    (cursor) => listAdminReviews(visibility, cursor),
  );
  const [hiding, setHiding] = useState<AdminReviewListItem | null>(null);
  const [unhidingId, setUnhidingId] = useState<string | null>(null);

  async function handleUnhide(review: AdminReviewListItem) {
    setUnhidingId(review.id);
    try {
      replace(await unhideAdminReview(review.id));
      showToast(ADMIN_TERMS.unhideReviewDone, 'success');
    } catch (error) {
      showToast(adminActionErrorMessage(error), 'danger');
    } finally {
      setUnhidingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{ADMIN_TERMS.reviewsTitle}</h1>
      <SegmentedControl
        name="admin-review-visibility"
        legend={ADMIN_TERMS.visibilityLegend}
        options={ADMIN_VISIBILITY_OPTIONS}
        value={visibility}
        onChange={(next) => setFilters({ visibility: next })}
        className="self-start"
      />
      <AdminListBody
        state={state}
        onRetry={retry}
        onLoadMore={loadMore}
        emptyTitle={ADMIN_TERMS.reviewsEmpty}
      >
        {(items) => (
          <Card className="p-4 md:p-5">
            <ul className="flex flex-col">
              {items.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  isUnhiding={unhidingId === review.id}
                  onHide={() => setHiding(review)}
                  onUnhide={() => void handleUnhide(review)}
                />
              ))}
            </ul>
          </Card>
        )}
      </AdminListBody>
      <AdminReasonDialog
        open={hiding !== null}
        onClose={() => setHiding(null)}
        title={ADMIN_TERMS.hideReviewTitle}
        description={ADMIN_TERMS.hideReviewDescription}
        subject={hiding ? reviewSubject(hiding) : []}
        reasonHint={ADMIN_TERMS.reasonHintLogOnly}
        confirmLabel={ADMIN_TERMS.hideReview}
        onSubmit={async (reason) => {
          if (!hiding) return null;
          try {
            replace(await hideAdminReview(hiding.id, reason));
            showToast(ADMIN_TERMS.hideReviewDone, 'success');
            return null;
          } catch (error) {
            return adminActionErrorMessage(error);
          }
        }}
      />
    </div>
  );
}

/** CR-232: who wrote it, the rating and how it starts — enough to tell one
 * review from its neighbours in the dialog. */
function reviewSubject(review: AdminReviewListItem): AdminReasonSubjectLine[] {
  return [
    {
      label: ADMIN_TERMS.subjectAuthor,
      value: review.author.displayName ?? review.author.email,
    },
    { value: ADMIN_TERMS.ratingLabel(review.rating) },
    {
      label: ADMIN_TERMS.subjectReviewText,
      value: ADMIN_TERMS.reviewExcerpt(review.comment),
      muted: !review.comment?.trim(),
    },
  ];
}

function ReviewRow({
  review,
  isUnhiding,
  onHide,
  onUnhide,
}: {
  review: AdminReviewListItem;
  isUnhiding: boolean;
  onHide: () => void;
  onUnhide: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 first:pt-0 last:border-none last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body font-medium tabular-nums text-text">
          {ADMIN_TERMS.ratingLabel(review.rating)}
        </p>
        {review.hiddenAt ? (
          <StatusBadge label={ADMIN_TERMS.badgeHidden} tone="warning" />
        ) : null}
      </div>
      <p
        className={
          review.comment
            ? 'whitespace-pre-line break-words text-body text-text'
            : 'text-body text-text-muted'
        }
      >
        {review.comment ?? ADMIN_TERMS.noComment}
      </p>
      <p className="break-words text-body-sm text-text-secondary">
        {ADMIN_TERMS.reviewOnRide(review.ride.title)}
      </p>
      <p className="text-body-sm text-text-secondary">
        <Link
          href={`/admin/users/${review.author.id}`}
          className="break-all rounded-sm text-text underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {review.author.displayName ?? review.author.email}
        </Link>
        {' · '}
        {formatAdminDateTime(review.createdAt)}
      </p>
      {review.hiddenReason ? (
        <p className="break-words text-body-sm text-text">
          {ADMIN_TERMS.reasonLine(review.hiddenReason)}
        </p>
      ) : null}
      <div>
        {review.hiddenAt ? (
          <Button variant="secondary" isLoading={isUnhiding} onClick={onUnhide}>
            {ADMIN_TERMS.unhide}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onHide}>
            {ADMIN_TERMS.hideReview}
          </Button>
        )}
      </div>
    </li>
  );
}
