import { and, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { DbClient } from 'db';
import { reviews, rides, users } from 'db/schema';
import type {
  AdminReviewListItem,
  ListAdminReviewsQuery,
  ListAdminReviewsResponse,
} from 'types';
import { clampLimit } from '../../lib/cursor.js';
import { setReviewHidden } from '../reviews/reviews.service.js';
import {
  REVIEW_NOT_FOUND,
  conflict,
  createdBeforeCursor,
  recordAdminAction,
  toPage,
} from './admin-common.js';

// CR-229/CR-230 (ADR-032): every review, hidden ones included, for the admin.
// Hide/unhide go through `reviews.service.ts` and write their `admin_actions` row
// in the same transaction.

const columns = {
  id: reviews.id,
  rating: reviews.rating,
  comment: reviews.comment,
  createdAt: reviews.createdAt,
  authorId: users.id,
  authorEmail: users.email,
  authorName: users.displayName,
  rideId: rides.id,
  rideTitle: rides.title,
  hiddenAt: reviews.hiddenAt,
  hiddenReason: reviews.hiddenReason,
};

type Row = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  authorId: string;
  authorEmail: string;
  authorName: string | null;
  rideId: string;
  rideTitle: string;
  hiddenAt: Date | null;
  hiddenReason: string | null;
};

function toItem(row: Row): AdminReviewListItem {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    author: {
      id: row.authorId,
      email: row.authorEmail,
      displayName: row.authorName,
    },
    ride: { id: row.rideId, title: row.rideTitle },
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
    hiddenReason: row.hiddenReason,
  };
}

function selectReviews(db: DbClient) {
  return db
    .select(columns)
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .innerJoin(rides, eq(reviews.rideId, rides.id));
}

export async function listAdminReviews(
  db: DbClient,
  query: ListAdminReviewsQuery,
): Promise<ListAdminReviewsResponse> {
  const limit = clampLimit(query.limit);
  const conditions: Array<SQL | undefined> = [
    createdBeforeCursor(query.cursor, reviews.createdAt, reviews.id),
  ];
  if (query.visibility === 'hidden') {
    conditions.push(isNotNull(reviews.hiddenAt));
  } else if (query.visibility === 'visible') {
    conditions.push(isNull(reviews.hiddenAt));
  }

  const rows = await selectReviews(db)
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit + 1);

  return toPage(rows, limit, toItem);
}

async function getAdminReview(
  db: DbClient,
  reviewId: string,
): Promise<AdminReviewListItem> {
  const [row] = await selectReviews(db)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row) throw REVIEW_NOT_FOUND();
  return toItem(row);
}

export async function adminSetReviewHidden(
  db: DbClient,
  adminUserId: string,
  reviewId: string,
  reason: string | null,
): Promise<AdminReviewListItem> {
  await getAdminReview(db, reviewId);
  await db.transaction(async (tx) => {
    if (!(await setReviewHidden(tx, reviewId, adminUserId, reason))) {
      throw reason === null
        ? conflict('review_not_hidden', 'This review is not hidden.')
        : conflict('review_already_hidden', 'This review is already hidden.');
    }
    await recordAdminAction(tx, {
      adminUserId,
      action: reason === null ? 'review_unhidden' : 'review_hidden',
      targetType: 'review',
      targetId: reviewId,
      reason,
    });
  });
  return getAdminReview(db, reviewId);
}
