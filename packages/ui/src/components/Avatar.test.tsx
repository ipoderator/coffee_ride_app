import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders the image when src is given', () => {
    render(<Avatar src="/v1/users/me/avatar" name="Иван Иванов" />);
    const img = screen.getByRole('img', { name: 'Иван Иванов' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', '/v1/users/me/avatar');
  });

  it('falls back to initials when there is no src', () => {
    render(<Avatar src={null} name="Иван Иванов" />);
    expect(screen.getByText('ИИ')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Иван Иванов' }),
    ).toBeInTheDocument();
  });

  it('falls back to a generic icon when there is neither src nor name', () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses an empty decorative alt when src is given with no name', () => {
    render(<Avatar src="/v1/organizers/org-1/avatar" />);
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('alt', '');
  });
});
