import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('renders its title and explanation', () => {
    render(
      <Notice title="Маршрут закреплён после публикации">
        Трек можно посмотреть и скачать.
      </Notice>,
    );
    expect(
      screen.getByText('Маршрут закреплён после публикации'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Трек можно посмотреть и скачать.'),
    ).toBeInTheDocument();
  });

  it('hides the icon from assistive technology and is not a live region', () => {
    const { container } = render(
      <Notice title="Заголовок" icon={<svg data-testid="icon" />} />,
    );
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(container.querySelector('[role]')).toBeNull();
  });
});
