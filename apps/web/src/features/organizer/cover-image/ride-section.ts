import { RIDE_EDIT_TERMS, RIDE_SECTION_HEAD_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

// KI-061 (ADR-009 registry, `@/lib/cabinet/organizer-ride-sections.ts`): the
// ride edit screen's link to the cover image upload.
export const organizerCoverRideSection: RideSectionLink = {
  label: RIDE_EDIT_TERMS.coverLink,
  hint: RIDE_EDIT_TERMS.coverLinkHint,
  title: RIDE_SECTION_HEAD_TERMS.cover.title,
  description: RIDE_SECTION_HEAD_TERMS.cover.description,
  icon: 'ImageIcon',
  segment: 'cover',
  order: 20,
};
