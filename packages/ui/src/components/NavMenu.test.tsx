import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NavMenu, NAV_MENU_ITEM_CLASSNAME } from './NavMenu';

function renderMenu(props: Partial<React.ComponentProps<typeof NavMenu>> = {}) {
  return render(
    <NavMenu label="Организатор" {...props}>
      <a href="/first" role="menuitem" className={NAV_MENU_ITEM_CLASSNAME}>
        Первый
      </a>
      <a href="/second" role="menuitem" className={NAV_MENU_ITEM_CLASSNAME}>
        Второй
      </a>
    </NavMenu>,
  );
}

describe('NavMenu', () => {
  it('starts closed, with the menu absent rather than merely hidden', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Организатор' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and exposes its items', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Организатор' }));

    expect(screen.getByRole('button', { name: 'Организатор' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Организатор' });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when an item is activated, since every item navigates', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Организатор' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Первый' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on an outside click', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Организатор' }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  // `docs/design.md` §12: full keyboard operability, not just a clickable
  // trigger.
  it('opens with ArrowDown from the trigger and focuses the first item', async () => {
    renderMenu();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Организатор' }), {
      key: 'ArrowDown',
    });

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Первый' })).toHaveFocus(),
    );
  });

  it('opens with ArrowUp from the trigger and focuses the last item', async () => {
    renderMenu();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Организатор' }), {
      key: 'ArrowUp',
    });

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Второй' })).toHaveFocus(),
    );
  });

  it('wraps arrow-key focus around both ends of the item list', async () => {
    renderMenu();
    const menuTrigger = screen.getByRole('button', { name: 'Организатор' });

    fireEvent.keyDown(menuTrigger, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Первый' })).toHaveFocus(),
    );

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Второй' })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Первый' })).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Второй' })).toHaveFocus();
  });

  it('keeps the label as the accessible name when it is visually hidden', () => {
    renderMenu({ labelHidden: true, icon: <span data-testid="icon" /> });

    expect(
      screen.getByRole('button', { name: 'Организатор' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
