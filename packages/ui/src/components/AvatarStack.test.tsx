import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarStack } from './AvatarStack';

describe('AvatarStack', () => {
  it('renders up to `max` avatars and collapses the rest into +N', () => {
    const people = [
      { name: 'Анна Кузнецова' },
      { name: 'Илья Смирнов' },
      { name: 'Марина Лебедева' },
      { name: 'Пётр Орлов' },
      { name: 'Ольга Титова' },
    ];
    const { container } = render(<AvatarStack people={people} max={3} />);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('uses the explicit `total` over people.length when given a preview list', () => {
    render(
      <AvatarStack
        people={[{ name: 'Анна' }, { name: 'Илья' }]}
        total={15}
        max={2}
      />,
    );
    expect(screen.getByText('+13')).toBeInTheDocument();
  });

  it('renders no overflow chip when everyone fits', () => {
    render(<AvatarStack people={[{ name: 'Анна' }]} max={4} />);
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it('exposes the total as an accessible group label', () => {
    render(<AvatarStack people={[{ name: 'Анна' }, { name: 'Илья' }]} />);
    expect(
      screen.getByRole('group', { name: 'Участники: 2' }),
    ).toBeInTheDocument();
  });
});
