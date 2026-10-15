// CR-269 (ADR-041): the two consent boxes every account-creating form requires.
export const TERMS_CONSENT_LABEL = /Я принимаю условия использования/;
export const PERSONAL_DATA_CONSENT_LABEL =
  /Я даю согласие на обработку персональных данных/;

/** Ticks both consent boxes, as a person must before submitting. */
export async function tickConsents(
  canvas: { getByLabelText: (label: RegExp) => HTMLElement },
  userEvent: { click: (element: Element) => Promise<void> },
): Promise<void> {
  await userEvent.click(canvas.getByLabelText(TERMS_CONSENT_LABEL));
  await userEvent.click(canvas.getByLabelText(PERSONAL_DATA_CONSENT_LABEL));
}
