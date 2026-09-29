import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './DatePicker';

// 2026-09-29 is a Tuesday.
const TODAY = '2026-09-29';

function Harness({
  initial = '',
  min,
  onChange,
}: {
  initial?: string;
  min?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="date">Дата</label>
      <DatePicker
        id="date"
        value={value}
        min={min}
        today={TODAY}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </>
  );
}

describe('DatePicker', () => {
  it('shows a placeholder, then the picked date in full Russian form', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByLabelText('Дата');
    expect(trigger).toHaveTextContent('Выберите дату');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Выбор даты' })).toBeVisible();
    expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Чт, 1 октября 2026' }));

    expect(onChange).toHaveBeenCalledWith('2026-10-01');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Чт, 1 октября 2026');
    expect(trigger).toHaveFocus();
  });

  it('starts Monday-first and marks today', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Дата'));

    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('Пн');
    expect(headers[6]).toHaveTextContent('Вс');
    expect(
      screen.getByRole('button', { name: 'Вт, 29 сентября 2026' }),
    ).toHaveAttribute('aria-current', 'date');
    // The grid opens on today, keyboard focus included.
    expect(
      screen.getByRole('button', { name: 'Вт, 29 сентября 2026' }),
    ).toHaveFocus();
  });

  it('offers today, tomorrow and the coming weekend as quick picks', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Дата'));

    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завтра' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Вс, 4 октября' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Сб, 3 октября' }));
    expect(onChange).toHaveBeenCalledWith('2026-10-03');
  });

  it('disables days before min, including the previous-month button', () => {
    render(<Harness min={TODAY} />);
    fireEvent.click(screen.getByLabelText('Дата'));

    expect(
      screen.getByRole('button', { name: 'Пн, 28 сентября 2026' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Вт, 29 сентября 2026' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Предыдущий месяц' }),
    ).toBeDisabled();
  });

  it('pages months with the header buttons', () => {
    render(<Harness initial="2026-01-31" />);
    fireEvent.click(screen.getByLabelText('Дата'));
    expect(screen.getByText('Январь 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));
    // 31 Jan + 1 month clamps to 28 Feb instead of overflowing into March.
    expect(screen.getByText('Февраль 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));
    expect(screen.getByText('Январь 2026')).toBeInTheDocument();
  });

  it('moves by keyboard, stops at min, picks with Enter and closes on Escape', () => {
    const onChange = vi.fn();
    render(<Harness min={TODAY} onChange={onChange} />);
    const trigger = screen.getByLabelText('Дата');
    fireEvent.click(trigger);
    const grid = screen.getByRole('grid');

    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(
      screen.getByRole('button', { name: 'Вт, 6 октября 2026' }),
    ).toHaveFocus();
    fireEvent.keyDown(grid, { key: 'End' });
    expect(
      screen.getByRole('button', { name: 'Вс, 11 октября 2026' }),
    ).toHaveFocus();
    fireEvent.keyDown(grid, { key: 'PageUp' });
    expect(
      screen.getByRole('button', { name: 'Пт, 11 сентября 2026' }),
    ).toBeInTheDocument();
    // 11 Sep is before min → focus stops on min.
    expect(
      screen.getByRole('button', { name: 'Вт, 29 сентября 2026' }),
    ).toHaveFocus();

    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on an outside click without changing the value', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Дата'));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
