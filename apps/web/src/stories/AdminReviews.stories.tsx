import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ADMIN_TERMS } from 'ui';
import { AdminReviewsList } from '@/features/admin/reviews/components/AdminReviewsList';
import { makeAdminReview } from '@/test-support/admin';
import {
  LONG_COMMENT,
  LONG_EMAIL,
  REVIEWS,
  expectNoSideScroll,
  json,
  stubAdmin,
} from './admin-fixtures';

// CR-231 (ADR-032): `/admin/reviews` — hide a review from the ride page and
// the organizer's rating.

const meta = {
  title: 'Admin/Reviews',
  component: AdminReviewsList,
  parameters: { layout: 'padded', nextjs: { appDirectory: true } },
} satisfies Meta<typeof AdminReviewsList>;
export default meta;
type Story = StoryObj<typeof meta>;

const list = stubAdmin((path) =>
  path.startsWith('/reviews')
    ? json({
        items: path.includes('visibility=hidden')
          ? REVIEWS.filter((review) => review.hiddenAt)
          : REVIEWS,
        nextCursor: null,
      })
    : undefined,
);

export const Default: Story = {
  beforeEach: list,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.noComment),
    ).toBeInTheDocument();
  },
};

/** CR-232: `/admin/reviews?visibility=hidden`, read from the URL. */
export const HiddenFromUrl: Story = {
  beforeEach: list,
  parameters: { nextjs: { navigation: { query: { visibility: 'hidden' } } } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.reasonLine('Оскорбления')),
    ).toBeInTheDocument();
    await expect(canvas.queryByText(ADMIN_TERMS.noComment)).toBeNull();
    await expect(
      canvas.getByRole('radio', { name: ADMIN_TERMS.visibility.hidden }),
    ).toBeChecked();
  },
};

/** CR-232: the dialog names the review — author, rating, start of the text. */
export const HideDialog: Story = {
  beforeEach: list,
  play: async ({ canvas, userEvent }) => {
    const [hide] = await canvas.findAllByRole('button', {
      name: ADMIN_TERMS.hideReview,
    });
    await userEvent.click(hide!);
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.hideReviewTitle,
    });
    const review = REVIEWS[0]!;
    for (const part of [
      review.author.displayName!,
      ADMIN_TERMS.ratingLabel(review.rating),
      review.comment!,
    ]) {
      await expect(dialog).toHaveAccessibleDescription(
        expect.stringContaining(part),
      );
    }
  },
};

/** A review with no text says «Без текста» in the dialog. */
export const HideDialogNoComment: Story = {
  beforeEach: list,
  play: async ({ canvas, userEvent }) => {
    const buttons = await canvas.findAllByRole('button', {
      name: ADMIN_TERMS.hideReview,
    });
    // `v-hidden` shows «Вернуть», so the second «Скрыть» is `v-empty`.
    await userEvent.click(buttons[1]!);
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.hideReviewTitle,
    });
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(ADMIN_TERMS.noComment),
    );
    await expect(
      within(dialog).getByText(ADMIN_TERMS.reasonHintLogOnly),
    ).toBeInTheDocument();
  },
};

/** A long comment is cut with «…»; a long author email wraps. */
export const HideDialogLongText: Story = {
  beforeEach: stubAdmin((path) =>
    path.startsWith('/reviews')
      ? json({
          items: [
            makeAdminReview({
              comment: LONG_COMMENT,
              author: { id: 'a-long', email: LONG_EMAIL, displayName: null },
            }),
          ],
          nextCursor: null,
        })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: ADMIN_TERMS.hideReview }),
    );
    const dialog = within(document.body).getByRole('dialog', {
      name: ADMIN_TERMS.hideReviewTitle,
    });
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(LONG_EMAIL),
    );
    await expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining(ADMIN_TERMS.reviewExcerpt(LONG_COMMENT)),
    );
    await expect(ADMIN_TERMS.reviewExcerpt(LONG_COMMENT)).toMatch(/…$/);
    await expectNoSideScroll(dialog);
  },
};

export const Empty: Story = {
  beforeEach: stubAdmin(() => json({ items: [], nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ADMIN_TERMS.reviewsEmpty),
    ).toBeInTheDocument();
  },
};

export const BothThemes: Story = {
  beforeEach: list,
  globals: { theme: 'both' },
};
