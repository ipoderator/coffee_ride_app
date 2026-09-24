import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bike } from 'types';
import { GarageForm } from './GarageForm';
import { createBike, deleteBike, listBikes, updateBike } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listBikes: vi.fn(),
    createBike: vi.fn(),
    updateBike: vi.fn(),
    deleteBike: vi.fn(),
  };
});

const listBikesMock = vi.mocked(listBikes);
const createBikeMock = vi.mocked(createBike);
const updateBikeMock = vi.mocked(updateBike);
const deleteBikeMock = vi.mocked(deleteBike);

function bike(overrides: Partial<Bike> & { id: string }): Bike {
  return {
    bikeType: 'road',
    brand: null,
    model: null,
    isActive: false,
    ...overrides,
  };
}

function listResponse(items: Bike[]) {
  return { items, nextCursor: null };
}

const ROAD_BIKE = bike({
  id: 'b-1',
  bikeType: 'road',
  brand: 'Canyon',
  model: 'Endurace',
  isActive: true,
});
const GRAVEL_BIKE = bike({
  id: 'b-2',
  bikeType: 'gravel',
  brand: 'Specialized',
  model: 'Diverge',
  isActive: false,
});

async function renderGarage(items: Bike[] = [ROAD_BIKE, GRAVEL_BIKE]) {
  listBikesMock.mockResolvedValue(listResponse(items));
  render(<GarageForm />);
  await screen.findByText('Гараж');
  // Wait for the loading skeleton to resolve into real content.
  await waitFor(() => expect(listBikesMock).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GarageForm — list', () => {
  it('renders the bikes with type, brand/model and the active marker', async () => {
    await renderGarage();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Canyon Endurace')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Шоссейный');
    expect(rows[0]).toHaveTextContent('Активный');
    expect(
      within(rows[1]!).getByText('Specialized Diverge'),
    ).toBeInTheDocument();
    expect(rows[1]).not.toHaveTextContent('Активный');
  });

  it('shows the empty state when there are no bikes', async () => {
    await renderGarage([]);
    expect(screen.getByText('Велосипедов пока нет')).toBeInTheDocument();
    expect(
      screen.getByText('Добавьте велосипед, чтобы использовать его в заездах.'),
    ).toBeInTheDocument();
  });

  it('shows an error state on a failed fetch with a working retry', async () => {
    listBikesMock.mockRejectedValueOnce(new Error('network down'));
    render(<GarageForm />);

    expect(
      await screen.findByText(
        'Не удалось загрузить гараж. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();

    listBikesMock.mockResolvedValue(listResponse([ROAD_BIKE]));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Canyon Endurace')).toBeInTheDocument();
  });
});

describe('GarageForm — add', () => {
  it('adds a bike with the chosen type/brand/model, then shows it in the list', async () => {
    await renderGarage([]);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить велосипед' }));
    const form = screen.getByRole('form', { name: 'Новый велосипед' });

    fireEvent.change(within(form).getByLabelText('Тип'), {
      target: { value: 'mtb' },
    });
    fireEvent.change(within(form).getByLabelText('Марка'), {
      target: { value: 'Trek' },
    });
    fireEvent.change(within(form).getByLabelText('Модель'), {
      target: { value: 'Fuel EX' },
    });

    const created = bike({
      id: 'b-3',
      bikeType: 'mtb',
      brand: 'Trek',
      model: 'Fuel EX',
    });
    createBikeMock.mockResolvedValue({ bike: created });
    listBikesMock.mockResolvedValue(listResponse([created]));

    fireEvent.click(within(form).getByRole('button', { name: 'Добавить' }));

    await waitFor(() =>
      expect(createBikeMock).toHaveBeenCalledWith({
        bikeType: 'mtb',
        brand: 'Trek',
        model: 'Fuel EX',
      }),
    );
    expect(await screen.findByText('Велосипед добавлен.')).toBeInTheDocument();
    expect(screen.getByText('Trek Fuel EX')).toBeInTheDocument();
  });

  it('protects against a double submit while the request is in flight', async () => {
    await renderGarage([]);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить велосипед' }));
    const form = screen.getByRole('form', { name: 'Новый велосипед' });

    let resolve: (value: { bike: Bike }) => void = () => {};
    createBikeMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const submit = within(form).getByRole('button', { name: 'Добавить' });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(createBikeMock).toHaveBeenCalledTimes(1);
    resolve({ bike: bike({ id: 'b-1' }) });
  });
});

describe('GarageForm — active / edit / delete', () => {
  it('marks a different bike active; the previously-active one is no longer marked', async () => {
    await renderGarage();

    updateBikeMock.mockResolvedValue({
      bike: { ...GRAVEL_BIKE, isActive: true },
    });
    listBikesMock.mockResolvedValue(
      listResponse([
        { ...ROAD_BIKE, isActive: false },
        { ...GRAVEL_BIKE, isActive: true },
      ]),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Сделать «Specialized Diverge» активным велосипедом',
      }),
    );

    await waitFor(() =>
      expect(updateBikeMock).toHaveBeenCalledWith('b-2', { isActive: true }),
    );

    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[0]!).queryByText('Активный')).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText('Активный')).toBeInTheDocument();
  });

  it('edits a bike, prefilling the current type/brand/model', async () => {
    await renderGarage();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Изменить велосипед «Canyon Endurace»',
      }),
    );
    const form = screen.getByRole('form', { name: 'Изменение велосипеда' });
    expect(within(form).getByLabelText('Марка')).toHaveValue('Canyon');
    expect(within(form).getByLabelText('Модель')).toHaveValue('Endurace');

    updateBikeMock.mockResolvedValue({
      bike: { ...ROAD_BIKE, model: 'Ultimate' },
    });
    fireEvent.change(within(form).getByLabelText('Модель'), {
      target: { value: 'Ultimate' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(updateBikeMock).toHaveBeenCalledWith('b-1', {
        bikeType: 'road',
        brand: 'Canyon',
        model: 'Ultimate',
      }),
    );
  });

  it('deletes only after the confirm dialog', async () => {
    await renderGarage();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить велосипед «Specialized Diverge»',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Удалить велосипед «Specialized Diverge»?',
    );
    expect(deleteBikeMock).not.toHaveBeenCalled();

    deleteBikeMock.mockResolvedValue(undefined);
    listBikesMock.mockResolvedValue(listResponse([ROAD_BIKE]));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Удалить велосипед' }),
    );

    await waitFor(() => expect(deleteBikeMock).toHaveBeenCalledWith('b-2'));
    expect(await screen.findByText('Велосипед удалён.')).toBeInTheDocument();
    expect(screen.queryByText('Specialized Diverge')).not.toBeInTheDocument();
  });

  it('cancelling the confirm deletes nothing', async () => {
    await renderGarage();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить велосипед «Canyon Endurace»',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(deleteBikeMock).not.toHaveBeenCalled();
  });
});
