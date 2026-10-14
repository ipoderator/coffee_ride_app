import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ErrorBoundary from './error';
import GlobalError from './global-error';

// CR-265: the unexpected-error state never shows what went wrong.
const leak = Object.assign(
  new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'),
  {
    digest: '1234567890',
    stack: 'Error: boom\n    at secret (/app/src/x.ts:1:1)',
  },
);

describe('error states', () => {
  it('error.tsx: the error screen with no message, digest or stack', () => {
    // Next passes `error`/`retry`; the component takes neither on purpose.
    const Boundary = ErrorBoundary as unknown as (props: {
      error: Error;
      retry: () => void;
    }) => React.ReactElement;
    const { container } = render(<Boundary error={leak} retry={() => {}} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Что-то пошло не так.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Обновить страницу' }),
    ).toBeVisible();
    expect(container.textContent).not.toMatch(
      /ECONNREFUSED|hunter2|1234567890|secret|x\.ts|Error:/,
    );
  });

  it('global-error.tsx: its own document with the same screen and nothing leaked', () => {
    const Global = GlobalError as unknown as (props: {
      error: Error;
      retry: () => void;
    }) => React.ReactElement;
    // A whole document — rendered as the server would, not into a test <div>.
    const html = renderToStaticMarkup(<Global error={leak} retry={() => {}} />);
    expect(html).toMatch(/^<html lang="ru" class="dark">/);
    expect(html).toContain('Что-то пошло не так.');
    expect(html).toContain('<title>Ошибка — Coffee Ride</title>');
    expect(html).not.toMatch(
      /ECONNREFUSED|hunter2|1234567890|secret|x\.ts|Error:/,
    );
  });
});
