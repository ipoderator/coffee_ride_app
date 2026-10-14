import { cn, PASSWORD_TERMS } from 'ui';

/**
 * CR-262: the live line under «Повторите пароль» — «Пароли совпадают» with a
 * check mark, or «Пароли не совпадают». Shown once something is typed into the
 * second field; the submit-time error (`FormField`'s) takes over when there is
 * one, so the two never say the same thing twice.
 */
export function PasswordMatch({
  password,
  confirmPassword,
}: {
  password: string;
  confirmPassword: string;
}) {
  if (confirmPassword.length === 0) return null;
  const matches = confirmPassword === password;
  return (
    <p
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 text-body-sm',
        matches ? 'text-success' : 'text-text-secondary',
      )}
    >
      {matches && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {matches ? PASSWORD_TERMS.match : PASSWORD_TERMS.mismatch}
    </p>
  );
}
