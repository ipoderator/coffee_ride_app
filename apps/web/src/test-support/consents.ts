import { fireEvent, screen } from '@testing-library/react';

// CR-268 (ADR-041): the two consent boxes every account-creating form requires.
export const TERMS_CONSENT_LABEL = /Я принимаю условия использования/;
export const PERSONAL_DATA_CONSENT_LABEL =
  /Я даю согласие на обработку персональных данных/;

/** Ticks both consent boxes, as a person must before «Зарегистрироваться». */
export function tickConsents(): void {
  fireEvent.click(screen.getByLabelText(TERMS_CONSENT_LABEL));
  fireEvent.click(screen.getByLabelText(PERSONAL_DATA_CONSENT_LABEL));
}
