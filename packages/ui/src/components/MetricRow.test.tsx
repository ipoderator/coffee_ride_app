import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricTile } from './MetricTile';
import { MetricRow } from './MetricRow';

describe('MetricRow', () => {
  it('renders every child tile it is given, in order', () => {
    render(
      <MetricRow>
        <MetricTile label="Дистанция" value="42,3" unit="км" />
        <MetricTile label="Набор высоты" value="1 250" unit="м" />
        <MetricTile label="Длительность" value="2 ч 30" unit="мин" />
      </MetricRow>,
    );
    const labels = screen.getAllByRole('term').map((el) => el.textContent);
    expect(labels).toEqual(['Дистанция', 'Набор высоты', 'Длительность']);
  });

  it('applies a responsive grid/flex layout class', () => {
    const { container } = render(
      <MetricRow>
        <MetricTile label="Дистанция" value="42,3" unit="км" />
      </MetricRow>,
    );
    const row = container.firstElementChild;
    expect(row?.className).toContain('grid-cols-1');
    expect(row?.className).toContain('sm:grid-cols-2');
    expect(row?.className).toContain('md:flex');
  });
});
