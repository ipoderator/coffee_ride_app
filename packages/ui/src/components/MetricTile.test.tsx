import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDistanceParts, formatParticipantsParts } from '../format';
import { MetricTile } from './MetricTile';

describe('MetricTile', () => {
  it('renders label, value, and unit as separate text', () => {
    render(<MetricTile label="Дистанция" value="42,3" unit="км" />);
    expect(screen.getByText('Дистанция')).toBeInTheDocument();
    expect(screen.getByText('42,3')).toBeInTheDocument();
    expect(screen.getByText('км')).toBeInTheDocument();
  });

  it('composes directly with a *Parts formatter', () => {
    const parts = formatDistanceParts(42.3);
    render(<MetricTile label="Дистанция" {...parts} />);
    expect(screen.getByText('42,3')).toBeInTheDocument();
    expect(screen.getByText('км')).toBeInTheDocument();
  });

  it('renders a missing value as an em dash with no unit element', () => {
    const parts = formatDistanceParts(null);
    const { container } = render(<MetricTile label="Дистанция" {...parts} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    // Only the value <span> should exist inside <dd> — no empty unit span rendered.
    expect(container.querySelectorAll('dd > span')).toHaveLength(1);
  });

  it('renders no unit element for a unit-less value (e.g. participants ratio)', () => {
    const parts = formatParticipantsParts(12, 20);
    const { container } = render(<MetricTile label="Участники" {...parts} />);
    // Testing Library's default text matcher normalizes (trims + collapses
    // whitespace, which includes NBSP) the DOM's text before comparing, but does NOT
    // normalize the search string itself (see @testing-library/dom's `matches()`) —
    // so a search string built from `parts.value` must have its own NBSP collapsed
    // to a plain space first, or an exact match against real formatter output (which
    // is deliberately NBSP-joined, CR-064) never succeeds.
    expect(
      screen.getByText(parts.value.replace(/\u00A0/g, String.fromCharCode(32))),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('dd > span')).toHaveLength(1);
  });

  it('uses dl/dt/dd for label/value semantic association', () => {
    const { container } = render(
      <MetricTile label="Дистанция" value="42,3" unit="км" />,
    );
    expect(container.querySelector('dl')).toBeInTheDocument();
    expect(container.querySelector('dt')).toHaveTextContent('Дистанция');
    expect(container.querySelector('dd')).toBeInTheDocument();
  });
});

describe('MetricTile note (CR-131)', () => {
  it('renders the note as a second description of the same term', () => {
    render(<MetricTile label="Записано" value="15/20" note="+3 за сутки" />);
    const note = screen.getByText('+3 за сутки');
    expect(note.tagName).toBe('DD');
    expect(note.className).toContain('text-text-secondary');
  });

  it('tints a success note', () => {
    render(
      <MetricTile
        label="Ближайший"
        value="2 дн"
        note="вс"
        noteTone="success"
      />,
    );
    expect(screen.getByText('вс').className).toContain('text-success');
  });
});
