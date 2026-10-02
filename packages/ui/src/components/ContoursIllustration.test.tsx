import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContoursIllustration } from './ContoursIllustration';
import { EmptyState } from './EmptyState';

describe('ContoursIllustration', () => {
  it('draws four contour rings in the inherited text colour', () => {
    const { container } = render(<ContoursIllustration />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('path')).toHaveLength(4);
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('is hidden from assistive tech when used as an EmptyState icon', () => {
    const { container } = render(
      <EmptyState title="Рядом пока тихо" icon={<ContoursIllustration />} />,
    );
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});
