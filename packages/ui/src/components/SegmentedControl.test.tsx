import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { value: 'track', label: 'Трек' },
  { value: 'map', label: 'Карта' },
] as const;

describe('SegmentedControl (CR-151)', () => {
  it('is a named radio group with the chosen option checked', () => {
    render(
      <SegmentedControl
        name="view"
        legend="Вид обложки"
        options={OPTIONS}
        value="map"
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole('group', { name: 'Вид обложки' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Карта' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Трек' })).not.toBeChecked();
  });

  it('reports the picked value', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        name="view"
        legend="Вид обложки"
        options={OPTIONS}
        value="track"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Карта' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });

  it('slides the thumb under the chosen option and hides it with no choice', () => {
    const { rerender } = render(
      <SegmentedControl
        name="group"
        legend="Группа"
        options={OPTIONS}
        value="map"
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('segmented-thumb').style.transform).toBe(
      'translateX(100%)',
    );
    rerender(
      <SegmentedControl
        name="group"
        legend="Группа"
        options={OPTIONS}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId('segmented-thumb')).toBeNull();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  it('shows a tall option description and disables every radio', () => {
    render(
      <SegmentedControl
        name="group"
        legend="Группа"
        showLegend
        variant="tall"
        options={[{ value: 'a', label: 'Бодрая', description: '25 км/ч' }]}
        value={null}
        onChange={() => {}}
        disabled
      />,
    );
    expect(screen.getByText('Группа')).not.toHaveClass('sr-only');
    expect(screen.getByText('25 км/ч')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Бодрая/ })).toBeDisabled();
  });

  it('inverts the chosen option on the dark cover', () => {
    render(
      <SegmentedControl
        name="view"
        legend="Вид обложки"
        tone="cover"
        options={OPTIONS}
        value="track"
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('segmented-thumb')).toHaveClass('bg-cover-ink');
    expect(
      screen.getByRole('radio', { name: 'Трек' }).closest('label'),
    ).toHaveClass('text-cover-bg');
    expect(
      screen.getByRole('radio', { name: 'Карта' }).closest('label'),
    ).toHaveClass('text-cover-ink/75');
  });

  it('marks the chosen tall option in the primary ink, with or without a second line', () => {
    render(
      <SegmentedControl
        name="group"
        legend="Группа"
        variant="tall"
        options={[
          { value: 'a', label: 'Бодрая', description: '25 км/ч' },
          { value: 'b', label: 'Без темпа' },
        ]}
        value="b"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Без темпа')).toHaveClass('text-primary');
    expect(screen.getByText('Бодрая')).not.toHaveClass('text-primary');
    expect(screen.getByTestId('segmented-thumb')).toHaveClass('rounded-xl');
  });
});
