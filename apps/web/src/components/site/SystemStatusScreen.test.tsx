import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatusScreen } from './SystemStatusScreen';

// CR-265: the mockup's «Техработы» tab and its unexpected-error sibling.
describe('SystemStatusScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says what the mockup says, with one h1 and the wordmark', () => {
    render(<SystemStatusScreen kind="maintenance" fullScreen />);
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent),
    ).toEqual(['Технический пит-стоп. Скоро снова в путь.']);
    expect(
      screen.getByText(
        'Мы обновляем Кофе Райд, чтобы сервис работал стабильнее. Ваши аккаунты, регистрации и заезды сохранены.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Плановые технические работы')).toBeInTheDocument();
    expect(screen.getByText('Кофе Райд')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('min-h-dvh');
  });

  it('draws no route line, points or illustration — the dot is the status alone', () => {
    const { container } = render(<SystemStatusScreen kind="maintenance" />);
    // The wordmark's two glyph SVGs only.
    expect(container.querySelectorAll('svg')).toHaveLength(2);
    expect(container.querySelectorAll('img, canvas')).toHaveLength(0);
    expect(
      container.querySelectorAll('[aria-hidden="true"].rounded-full'),
    ).toHaveLength(1);
  });

  it('reloads the page from «Обновить страницу»', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(<SystemStatusScreen kind="maintenance" />);
    fireEvent.click(screen.getByRole('button', { name: 'Обновить страницу' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('opens a letter from «Написать нам»', () => {
    render(<SystemStatusScreen kind="maintenance" />);
    expect(screen.getByRole('link', { name: 'Написать нам' })).toHaveAttribute(
      'href',
      'mailto:glebchurkin48@gmail.com',
    );
  });

  it('uses native controls, refresh first in the tab order', () => {
    render(<SystemStatusScreen kind="error" />);
    const refresh = screen.getByRole('button', { name: 'Обновить страницу' });
    const contact = screen.getByRole('link', { name: 'Написать нам' });
    // A real <button type="button"> (Enter/Space) and an <a href> (Enter) —
    // no tabindex games; Chromium checks the Tab order on the running page.
    expect(refresh.tagName).toBe('BUTTON');
    expect(refresh).toHaveAttribute('type', 'button');
    expect(refresh).not.toHaveAttribute('tabindex');
    expect(contact.tagName).toBe('A');
    expect(
      refresh.compareDocumentPosition(contact) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    refresh.focus();
    expect(refresh).toHaveFocus();
    contact.focus();
    expect(contact).toHaveFocus();
  });

  it('has its own text for an unexpected error, and no cause', () => {
    render(<SystemStatusScreen kind="error" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Что-то пошло не так.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Непредвиденная ошибка')).toBeInTheDocument();
    expect(screen.queryByText('Плановые технические работы')).toBeNull();
    expect(screen.getByRole('main')).not.toHaveClass('min-h-dvh');
  });
});
