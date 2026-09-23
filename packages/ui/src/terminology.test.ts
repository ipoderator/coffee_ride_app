import { describe, expect, it } from 'vitest';
import {
  BICYCLE_TYPE_TERMS,
  DIFFICULTY_LEVEL_TERMS,
  METRIC_TERMS,
  ORGANIZER_TERMS,
  REGISTRATION_ACTION_TERMS,
  RIDE_SERVICE_TERMS,
  RIDE_STATUS_TERMS,
  UI_TERMS,
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

describe('DIFFICULTY_LEVEL_TERMS', () => {
  it('matches docs/design.md §6, in level order', () => {
    expect(DIFFICULTY_LEVEL_TERMS).toEqual({
      1: 'Лёгкий',
      2: 'Ниже среднего',
      3: 'Средний',
      4: 'Сложный',
      5: 'Очень сложный',
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
      joinWaitlist: 'Встать в список ожидания',
      leaveWaitlist: 'Покинуть список ожидания',
    });
  });
});

describe('UI_TERMS', () => {
  it('provides the generic retry label used by ErrorState (docs/design.md §10)', () => {
    expect(UI_TERMS.retry).toBe('Повторить');
  });
});

describe('ORGANIZER_TERMS.ratingReviewsCount (CR-043)', () => {
  it('applies the correct Russian cardinal plural for review counts', () => {
    expect(ORGANIZER_TERMS.ratingReviewsCount(1)).toBe('1 отзыв');
    expect(ORGANIZER_TERMS.ratingReviewsCount(2)).toBe('2 отзыва');
    expect(ORGANIZER_TERMS.ratingReviewsCount(4)).toBe('4 отзыва');
    expect(ORGANIZER_TERMS.ratingReviewsCount(5)).toBe('5 отзывов');
    expect(ORGANIZER_TERMS.ratingReviewsCount(21)).toBe('21 отзыв');
    expect(ORGANIZER_TERMS.ratingReviewsCount(11)).toBe('11 отзывов');
    expect(ORGANIZER_TERMS.ratingReviewsCount(12)).toBe('12 отзывов');
  });
});

// CR-119 (ride detail «Топокарта»).
describe('CR-119 ride detail terms', () => {
  it('pluralizes seats left and rider counts', async () => {
    const {
      RIDE_DETAIL_GROUP_TERMS,
      RIDE_DETAIL_REGISTRATION_TERMS,
      RIDE_DETAIL_RIDERS_TERMS,
    } = await import('./terminology');
    expect(RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(1)).toBe(
      'Осталось 1 место',
    );
    expect(RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(3)).toBe(
      'Осталось 3 места',
    );
    expect(RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(11)).toBe(
      'Осталось 11 мест',
    );
    expect(RIDE_DETAIL_REGISTRATION_TERMS.seatsLeft(21)).toBe(
      'Осталось 21 место',
    );
    expect(RIDE_DETAIL_RIDERS_TERMS.ridersCount(14)).toBe('14 участников');
    expect(RIDE_DETAIL_GROUP_TERMS.ridersCount(22)).toBe('22 участника');
    expect(RIDE_DETAIL_GROUP_TERMS.ridingIn('Группа 1', '25 км/ч')).toBe(
      'Вы едете в группе «Группа 1» · 25 км/ч',
    );
  });
});
