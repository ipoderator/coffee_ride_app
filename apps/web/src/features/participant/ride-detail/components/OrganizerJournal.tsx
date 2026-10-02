import type { OrganizerJournal as OrganizerJournalData } from 'types';
import {
  BICYCLE_TYPE_TERMS,
  ORGANIZER_JOURNAL_TERMS as TERMS,
  formatDistance,
  formatGroupPace,
} from 'ui';

interface OrganizerJournalProps {
  journal: OrganizerJournalData;
}

/**
 * CR-173 («Журнал организатора»): what the organizer's past rides say, as quiet
 * lines in a ledger — no stars, badges or colour-coded verdicts. The facts come
 * from the API already filtered (finished/cancelled only, thin figures `null`),
 * so a missing line here means "not enough to say", never a hidden zero.
 */
export function OrganizerJournal({ journal }: OrganizerJournalProps) {
  const closed = journal.finishedCount + journal.cancelledCount;
  const lines: { key: string; label: string | null; text: string }[] = [];

  if (journal.finishedCount === 0) {
    lines.push({ key: 'none', label: null, text: TERMS.noFinished });
  } else {
    lines.push({
      key: 'finished',
      label: null,
      text: TERMS.finished(journal.finishedCount),
    });
  }
  if (journal.completionPercent !== null) {
    lines.push({
      key: 'completion',
      label: null,
      text: TERMS.completion(
        journal.finishedCount,
        closed,
        journal.completionPercent,
      ),
    });
  } else if (journal.cancelledCount > 0) {
    lines.push({
      key: 'cancelled',
      label: null,
      text: TERMS.cancelled(journal.cancelledCount),
    });
  }

  const typical: string[] = [];
  if (journal.typicalPaceKmh !== null) {
    typical.push(TERMS.typicalPace(formatGroupPace(journal.typicalPaceKmh)));
  }
  if (journal.typicalDistanceKm !== null) {
    typical.push(
      TERMS.typicalDistance(formatDistance(journal.typicalDistanceKm)),
    );
  }
  if (typical.length > 0) {
    lines.push({
      key: 'typical',
      label: TERMS.typicalLabel,
      text: typical.join(', '),
    });
  }
  if (journal.bicycleTypes.length > 0) {
    lines.push({
      key: 'types',
      label: TERMS.bicycleTypesLabel,
      text: journal.bicycleTypes
        .map((type) => BICYCLE_TYPE_TERMS[type].toLowerCase())
        .join(', '),
    });
  }

  return (
    <dl
      className="flex max-w-[62ch] flex-col divide-y divide-border border-y border-border text-body-sm tabular-nums"
      data-testid="organizer-journal"
    >
      {lines.map((line) => (
        <div key={line.key} className="flex gap-2 py-2.5">
          {line.label ? (
            <dt className="text-text-secondary">{line.label}:</dt>
          ) : null}
          <dd className="text-text">{line.text}</dd>
        </div>
      ))}
    </dl>
  );
}
