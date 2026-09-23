import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProblemDetails } from 'types';
import { GroupsEditor } from './components/GroupsEditor';
import {
  ApiError,
  createRideGroup,
  deleteRideGroup,
  getRideStatus,
  listRideGroups,
  updateRideGroup,
  type RideGroupWithCount,
} from './api';
import { parsePace, validateGroupForm } from './validation';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideStatus: vi.fn(),
    listRideGroups: vi.fn(),
    createRideGroup: vi.fn(),
    updateRideGroup: vi.fn(),
    deleteRideGroup: vi.fn(),
  };
});

const getRideStatusMock = vi.mocked(getRideStatus);
const listRideGroupsMock = vi.mocked(listRideGroups);
const createRideGroupMock = vi.mocked(createRideGroup);
const updateRideGroupMock = vi.mocked(updateRideGroup);
const deleteRideGroupMock = vi.mocked(deleteRideGroup);

function group(
  overrides: Partial<RideGroupWithCount> & { id: string; position: number },
): RideGroupWithCount {
  return {
    rideId: 'ride-1',
    name: `Группа ${overrides.position + 1}`,
    paceKmh: 25,
    description: null,
    createdAt: '2027-01-01T10:00:00.000Z',
    updatedAt: '2027-01-01T10:00:00.000Z',
    updatedBy: null,
    registrationsCount: 0,
    ...overrides,
  };
}

const SLOW = group({
  id: 'g-1',
  position: 0,
  paceKmh: 25,
  description: 'Спокойный темп, ждём всех',
  registrationsCount: 7,
});
const FAST = group({ id: 'g-2', position: 1, paceKmh: 32.5 });

function problem(code: string, status = 409): ApiError {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: code,
    status,
    detail: code,
    instance: '/v1/rides/ride-1/groups',
    code,
  };
  return new ApiError(body);
}

function listResponse(items: RideGroupWithCount[]) {
  return { items, nextCursor: null };
}

async function renderEditor(items: RideGroupWithCount[] = [SLOW, FAST]) {
  listRideGroupsMock.mockResolvedValue(listResponse(items));
  render(<GroupsEditor rideId="ride-1" />);
  await screen.findByText(/участник при регистрации обязательно выбирает/);
}

function openAddForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Добавить группу' }));
  return screen.getByRole('form', { name: 'Новая группа' });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRideStatusMock.mockResolvedValue('draft');
});

describe('GroupsEditor — list', () => {
  it('lists groups in order with pace, participant count and description', async () => {
    await renderEditor();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Группа 1')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('25 км/ч');
    expect(rows[0]).toHaveTextContent('7 участников');
    expect(rows[0]).toHaveTextContent('Спокойный темп, ждём всех');
    expect(within(rows[1]!).getByText('Группа 2')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('32,5 км/ч');
    expect(rows[1]).toHaveTextContent('0 участников');

    // Reorder is plain buttons (keyboard-reachable), disabled at the ends.
    expect(
      screen.getByRole('button', {
        name: 'Переместить группу «Группа 1» выше',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Переместить группу «Группа 2» ниже',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Изменить группу «Группа 1»' }),
    ).toBeEnabled();
  });

  it('shows the empty state when the ride has no groups', async () => {
    await renderEditor([]);
    expect(
      screen.getByText('Групп нет — все участники едут вместе.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Добавьте группы, если заезд делится по темпу.'),
    ).toBeInTheDocument();
  });

  it('hides the add button once the ride has 6 groups', async () => {
    await renderEditor(
      Array.from({ length: 6 }, (_, i) => group({ id: `g-${i}`, position: i })),
    );
    expect(
      screen.queryByRole('button', { name: 'Добавить группу' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Добавлено максимальное число групп — 6.'),
    ).toBeInTheDocument();
  });

  it('is read-only for a finished ride', async () => {
    getRideStatusMock.mockResolvedValue('finished');
    await renderEditor();
    expect(
      screen.getByText(
        'Заезд завершён или отменён — группы больше нельзя менять.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Добавить группу' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Удалить группу/ }),
    ).not.toBeInTheDocument();
  });
});

describe('GroupsEditor — add', () => {
  it('suggests «Группа N» and sends a numeric pace parsed from «27,5»', async () => {
    await renderEditor();
    const form = openAddForm();
    const name = within(form).getByLabelText('Название');
    expect(name).toHaveValue('Группа 3');

    createRideGroupMock.mockResolvedValue({
      ...group({ id: 'g-3', position: 2, paceKmh: 27.5 }),
    });
    listRideGroupsMock.mockResolvedValue(
      listResponse([
        SLOW,
        FAST,
        group({ id: 'g-3', position: 2, paceKmh: 27.5 }),
      ]),
    );

    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '27,5' },
    });
    fireEvent.change(within(form).getByLabelText('Описание (необязательно)'), {
      target: { value: '  Без остановок  ' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));

    await waitFor(() =>
      expect(createRideGroupMock).toHaveBeenCalledWith('ride-1', {
        name: 'Группа 3',
        paceKmh: 27.5,
        description: 'Без остановок',
      }),
    );
    expect(await screen.findByText('Группа добавлена.')).toBeInTheDocument();
    expect(screen.getByText('Группа 3')).toBeInTheDocument();
  });

  it('protects against a double submit while the request is in flight', async () => {
    await renderEditor([]);
    const form = openAddForm();
    let resolve: (value: RideGroupWithCount) => void = () => {};
    createRideGroupMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '25' },
    });
    const submit = within(form).getByRole('button', { name: 'Добавить' });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(createRideGroupMock).toHaveBeenCalledTimes(1);
    resolve(group({ id: 'g-1', position: 0 }));
  });

  it('validates on the client and never calls the API with bad input', async () => {
    await renderEditor([]);
    const form = openAddForm();
    fireEvent.change(within(form).getByLabelText('Название'), {
      target: { value: '   ' },
    });
    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '70' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));

    expect(
      await within(form).findByText('Укажите название группы.'),
    ).toBeInTheDocument();
    expect(
      within(form).getByText('Скорость — от 5 до 60 км/ч.'),
    ).toBeInTheDocument();
    expect(createRideGroupMock).not.toHaveBeenCalled();
  });
});

describe('validateGroupForm / parsePace', () => {
  it('accepts a decimal comma or point, rejects anything else', () => {
    expect(parsePace('27,5')).toBe(27.5);
    expect(parsePace(' 30 ')).toBe(30);
    expect(parsePace('27.5')).toBe(27.5);
    expect(parsePace('27,5,1')).toBeNull();
    expect(parsePace('abc')).toBeNull();
    expect(parsePace('1e2')).toBeNull();
  });

  it('mirrors the API bounds plus the 0,5 step', () => {
    const base = { name: 'Группа 1', description: '' };
    expect(validateGroupForm({ ...base, pace: '' })).toMatchObject({
      ok: false,
      errors: { pace: 'Укажите среднюю скорость.' },
    });
    expect(validateGroupForm({ ...base, pace: 'быстро' })).toMatchObject({
      ok: false,
      errors: { pace: 'Введите число, например 27,5.' },
    });
    expect(validateGroupForm({ ...base, pace: '4,5' })).toMatchObject({
      ok: false,
      errors: { pace: 'Скорость — от 5 до 60 км/ч.' },
    });
    expect(validateGroupForm({ ...base, pace: '27,3' })).toMatchObject({
      ok: false,
      errors: { pace: 'Скорость указывается с шагом 0,5 км/ч.' },
    });
    expect(
      validateGroupForm({ ...base, name: 'Я'.repeat(61), pace: '25' }),
    ).toMatchObject({
      ok: false,
      errors: { name: 'Название — не длиннее 60 символов.' },
    });
    expect(
      validateGroupForm({ ...base, pace: '25', description: 'а'.repeat(501) }),
    ).toMatchObject({
      ok: false,
      errors: { description: 'Описание — не длиннее 500 символов.' },
    });
    expect(validateGroupForm({ ...base, pace: '60' })).toEqual({
      ok: true,
      payload: { name: 'Группа 1', paceKmh: 60, description: null },
    });
  });
});

describe('GroupsEditor — server errors', () => {
  it('maps group_name_taken to the name field', async () => {
    await renderEditor();
    const form = openAddForm();
    createRideGroupMock.mockRejectedValue(problem('group_name_taken'));
    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '30' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));
    expect(
      await within(form).findByText('Группа с таким названием уже есть'),
    ).toBeInTheDocument();
  });

  it('maps group_limit_reached', async () => {
    await renderEditor();
    const form = openAddForm();
    createRideGroupMock.mockRejectedValue(problem('group_limit_reached'));
    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '30' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByText('Не больше 6 групп')).toBeInTheDocument();
  });

  it('maps group_has_registrations on delete', async () => {
    await renderEditor();
    deleteRideGroupMock.mockRejectedValue(problem('group_has_registrations'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить группу «Группа 1»' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить группу' }),
    );
    expect(
      await screen.findByText(
        'В группе есть участники — сначала переведите их или отмените регистрации',
      ),
    ).toBeInTheDocument();
  });

  it('switches to read-only on ride_groups_not_editable', async () => {
    await renderEditor();
    const form = openAddForm();
    createRideGroupMock.mockRejectedValue(problem('ride_groups_not_editable'));
    fireEvent.change(within(form).getByLabelText('Средняя скорость, км/ч'), {
      target: { value: '30' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));
    expect(
      await screen.findByText(
        'Заезд завершён или отменён — группы больше нельзя менять.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Новая группа' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Переместить группу/ }),
    ).not.toBeInTheDocument();
  });
});

describe('GroupsEditor — edit, delete, reorder', () => {
  it('edits a group, prefilling the pace with a decimal comma', async () => {
    await renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Изменить группу «Группа 2»' }),
    );
    const form = screen.getByRole('form', { name: 'Изменение группы' });
    expect(within(form).getByLabelText('Средняя скорость, км/ч')).toHaveValue(
      '32,5',
    );
    updateRideGroupMock.mockResolvedValue(FAST);
    fireEvent.change(within(form).getByLabelText('Название'), {
      target: { value: 'Быстрая' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(updateRideGroupMock).toHaveBeenCalledWith('ride-1', 'g-2', {
        name: 'Быстрая',
        paceKmh: 32.5,
        description: null,
      }),
    );
  });

  it('deletes only after the danger confirm', async () => {
    await renderEditor();
    deleteRideGroupMock.mockResolvedValue(undefined);
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить группу «Группа 2»' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Удалить группу «Группа 2»?');
    expect(deleteRideGroupMock).not.toHaveBeenCalled();

    listRideGroupsMock.mockResolvedValue(listResponse([SLOW]));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить группу' }),
    );
    await waitFor(() =>
      expect(deleteRideGroupMock).toHaveBeenCalledWith('ride-1', 'g-2'),
    );
    expect(await screen.findByText('Группа удалена.')).toBeInTheDocument();
    expect(screen.queryByText('Группа 2')).not.toBeInTheDocument();
  });

  it('cancelling the confirm deletes nothing', async () => {
    await renderEditor();
    fireEvent.click(
      screen.getByRole('button', { name: 'Удалить группу «Группа 1»' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(deleteRideGroupMock).not.toHaveBeenCalled();
  });

  it('moves a group with PATCH position and keeps focus on it', async () => {
    await renderEditor();
    updateRideGroupMock.mockResolvedValue({ ...FAST, position: 0 });
    listRideGroupsMock.mockResolvedValue(
      listResponse([
        { ...FAST, position: 0 },
        { ...SLOW, position: 1 },
      ]),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Переместить группу «Группа 2» выше',
      }),
    );

    await waitFor(() =>
      expect(updateRideGroupMock).toHaveBeenCalledWith('ride-1', 'g-2', {
        position: 0,
      }),
    );
    await screen.findByText('Порядок групп изменён.');
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Группа 2')).toBeInTheDocument();
    // Now first: «выше» is disabled, so focus lands on its «ниже».
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Переместить группу «Группа 2» ниже',
        }),
      ).toHaveFocus(),
    );
  });

  it('moves a group down', async () => {
    await renderEditor();
    updateRideGroupMock.mockResolvedValue({ ...SLOW, position: 1 });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Переместить группу «Группа 1» ниже',
      }),
    );
    await waitFor(() =>
      expect(updateRideGroupMock).toHaveBeenCalledWith('ride-1', 'g-1', {
        position: 1,
      }),
    );
  });
});
