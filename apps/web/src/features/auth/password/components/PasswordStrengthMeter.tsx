import { cn, PASSWORD_TERMS } from 'ui';
import {
  passwordStrength,
  STRENGTH_STEPS,
  type PasswordStrength,
} from '../strength';

const FILL: Record<PasswordStrength, string> = {
  too_short: 'bg-danger',
  weak: 'bg-warning',
  good: 'bg-success',
  strong: 'bg-success',
};

/**
 * CR-262: the auth mockup's four-segment meter under «Пароль». The level is also
 * said in words (`docs/design.md` §12: never colour alone) and announced politely
 * as it changes. Nothing renders for an empty field.
 */
export function PasswordStrengthMeter({
  password,
  id,
}: {
  password: string;
  id?: string;
}) {
  const strength = passwordStrength(password);
  if (!strength) return null;
  const steps = STRENGTH_STEPS[strength];
  return (
    <div id={id} className="flex flex-col gap-1.5" data-strength={strength}>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1 rounded-full',
              step <= steps ? FILL[strength] : 'bg-border',
            )}
          />
        ))}
      </div>
      <p className="text-body-sm text-text-secondary" aria-live="polite">
        {PASSWORD_TERMS.strengthLabel}: {PASSWORD_TERMS.strength[strength]}
      </p>
    </div>
  );
}
