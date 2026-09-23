import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileInput } from './FileInput';

describe('FileInput', () => {
  it('is always a file input, labelled by its <label>', () => {
    render(
      <>
        <label htmlFor="f">Файл</label>
        <FileInput id="f" accept="image/png" />
      </>,
    );
    const input = screen.getByLabelText('Файл');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/png');
  });

  it('styles the native picker button so it reads as a button', () => {
    render(<FileInput data-testid="f" />);
    expect(screen.getByTestId('f').className).toMatch(/file:border/);
  });

  it('forwards a ref to the underlying input (callers read `.files`)', () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileInput ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
