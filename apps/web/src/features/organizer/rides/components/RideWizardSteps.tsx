import Link from 'next/link';
import { RIDE_WIZARD_TERMS, cn } from 'ui';
import { RIDE_WIZARD_STEPS, type RideWizardStepKey } from '../wizard-steps';

interface RideWizardStepsProps {
  current: RideWizardStepKey;
  rideId: string | null;
}

/**
 * CR-156: the wizard's step list — a vertical column beside the form from
 * `xl` (the mockup), a 2×2 / 1×4 grid of titles above it below that. Steps
 * that need a draft render as plain text until one exists.
 */
export function RideWizardSteps({ current, rideId }: RideWizardStepsProps) {
  const currentNumber =
    RIDE_WIZARD_STEPS.find((step) => step.key === current)?.number ?? 1;

  return (
    <nav
      aria-label={RIDE_WIZARD_TERMS.navLabel}
      className="flex flex-col gap-3 xl:sticky xl:top-6 xl:self-start"
    >
      <p className="font-mono text-label uppercase text-text-muted">
        {RIDE_WIZARD_TERMS.stepCounter(currentNumber, RIDE_WIZARD_STEPS.length)}
      </p>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-1 xl:gap-1">
        {RIDE_WIZARD_STEPS.map((step) => {
          const terms = RIDE_WIZARD_TERMS.steps[step.key];
          const isCurrent = step.key === current;
          const href = step.href(rideId);
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full font-num text-body-sm font-semibold tabular-nums',
                  isCurrent
                    ? 'bg-primary-fill text-on-primary-fill'
                    : 'border-[1.5px] border-border-input text-text-secondary',
                )}
              >
                {step.number}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    'text-body-sm font-semibold',
                    href ? 'text-text' : 'text-text-muted',
                  )}
                >
                  {terms.title}
                </span>
                <span className="hidden text-body-sm text-text-muted xl:block">
                  {terms.hint}
                </span>
                {!href && (
                  <span className="sr-only">
                    {RIDE_WIZARD_TERMS.stepLockedHint}
                  </span>
                )}
              </span>
            </>
          );
          const itemClassName = cn(
            'flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 xl:items-start xl:py-3',
            isCurrent && 'bg-surface',
          );

          return (
            <li key={step.key}>
              {href && !isCurrent ? (
                <Link
                  href={href}
                  className={cn(
                    itemClassName,
                    'hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div
                  className={itemClassName}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
