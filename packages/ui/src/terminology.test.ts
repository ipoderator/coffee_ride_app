import { describe, expect, it } from 'vitest';
import {
  BICYCLE_TYPE_TERMS,
  METRIC_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_SERVICE_TERMS,
  RIDE_STATUS_TERMS,
} from './terminology';

describe('RIDE_STATUS_TERMS', () => {
  it('covers every status from docs/product.md lifecycle with the documented label + tone', () => {
    expect(RIDE_STATUS_TERMS.draft).toEqual({
      label: 'Черновик',
      tone: 'neutral',
    });
    expect(RIDE_STATUS_TERMS.published).toEqual({
      label: 'Опубликован',
      tone: 'success',
    });
    expect(RIDE_STATUS_TERMS.registration_open).toEqual({
      label: 'Регистрация открыта',
      tone: 'success',
    });
    expect(RIDE_STATUS_TERMS.registration_closed).toEqual({
      label: 'Регистрация закрыта',
      tone: 'warning',
    });
    expect(RIDE_STATUS_TERMS.started).toEqual({
      label: 'Заезд начался',
      tone: 'info',
    });
    expect(RIDE_STATUS_TERMS.finished).toEqual({
      label: 'Завершён',
      tone: 'neutral',
    });
    expect(RIDE_STATUS_TERMS.cancelled).toEqual({
      label: 'Отменён',
      tone: 'danger',
    });
  });

  it('has exactly the seven lifecycle keys, no more, no fewer', () => {
    expect(Object.keys(RIDE_STATUS_TERMS).sort()).toEqual(
      [
        'draft',
        'published',
        'registration_open',
        'registration_closed',
        'started',
        'finished',
        'cancelled',
      ].sort(),
    );
  });
});

describe('BICYCLE_TYPE_TERMS', () => {
  it('covers all four bicycle types', () => {
    expect(BICYCLE_TYPE_TERMS).toEqual({
      road: 'Шоссейный',
      gravel: 'Гравийный',
      mtb: 'Горный (MTB)',
      any: 'Любой',
    });
  });
});

describe('RIDE_SERVICE_TERMS', () => {
  it('covers all ten services from docs/design.md §13, in the documented wording', () => {
    expect(Object.values(RIDE_SERVICE_TERMS)).toEqual([
      'Питание',
      'Вода',
      'Кофе',
      'Машина сопровождения',
      'Механик',
      'Медицинская поддержка',
      'Трансфер',
      'Перевозка велосипедов',
      'Парковка',
      'Раздевалка и душ',
    ]);
  });
});

describe('METRIC_TERMS', () => {
  it('matches docs/design.md §13', () => {
    expect(METRIC_TERMS).toEqual({
      distance: 'Дистанция',
      elevation: 'Набор высоты',
      pace: 'Средний темп',
      duration: 'Длительность',
      difficulty: 'Сложность',
      participants: 'Участники',
    });
  });
});

describe('REGISTRATION_ACTION_TERMS', () => {
  it('matches docs/design.md §13', () => {
    expect(REGISTRATION_ACTION_TERMS).toEqual({
      register: 'Зарегистрироваться',
      cancel: 'Отменить регистрацию',
      waitlisted: 'В списке ожидания',
      full: 'Мест не осталось',
    });
  });
});
