'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { buttonClassName } from 'ui';
import { wizardStepHref, type RideWizardStepKey } from '../wizard-steps';
import { RideWizardSteps } from './RideWizardSteps';

interface WizardLink {
  step: RideWizardStepKey;
  label: string;
}

interface RideWizardFrameProps {
  current: RideWizardStepKey;
  rideId: string | null;
  children: ReactNode;
  /** Footer links for steps 2–4, which wrap an existing screen that has no
   * wizard navigation of its own. Step 1 renders its own footer (its
   * «Далее» saves first). Both need a `rideId`. */
  back?: WizardLink;
  next?: WizardLink;
}

/** CR-156: step list + content, the layout every wizard step shares. */
export function RideWizardFrame({
  current,
  rideId,
  children,
  back,
  next,
}: RideWizardFrameProps) {
  const showFooter = rideId !== null && (back || next);

  return (
    <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-10">
      <RideWizardSteps current={current} rideId={rideId} />
      <div className="flex min-w-0 flex-col gap-6">
        {children}
        {showFooter && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            {back ? (
              <Link
                href={wizardStepHref(back.step, rideId)}
                className={buttonClassName('secondary')}
              >
                {back.label}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={wizardStepHref(next.step, rideId)}
                className={buttonClassName('primary')}
              >
                {next.label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
