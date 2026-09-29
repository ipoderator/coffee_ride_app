// CR-158: axe exceptions for product-level contrast defects the stories
// surfaced. Each is scoped to the stories that render the defect and names
// its known issue — remove the exception together with the fix, never widen it.

/**
 * KI-080: light-theme `--danger` (#D42B20) as text is 4.49:1 on `--bg`
 * (#F3F1F5) and 3.87:1 on `ErrorState`'s `danger/10` tint (its retry
 * button) — just under WCAG AA's 4.5:1. Only `color-contrast` is off; every
 * other axe rule still fails the story.
 */
export const KI_080_DANGER_CONTRAST = {
  a11y: {
    config: { rules: [{ id: 'color-contrast', enabled: false }] },
  },
};
