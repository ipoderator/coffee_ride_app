import { describe, expect, it } from 'vitest';
import {
  GARAGE_TERMS,
  ORGANIZER_GROUPS_TERMS,
  ORGANIZER_OVERVIEW_TERMS,
  RIDE_CREATE_TERMS,
  RIDE_DETAIL_RIDERS_TERMS,
  RIDE_PAGE_TERMS,
  RIDE_ROUTE_BUILDER_TERMS,
  RIDE_WIZARD_TERMS,
} from './terminology';

describe('RIDE_PAGE_TERMS (CR-155)', () => {
  it('uses the genitive after «из» for the seat limit', () => {
    expect(RIDE_PAGE_TERMS.ofLimit(20)).toBe('из 20 участников');
    expect(RIDE_PAGE_TERMS.ofLimit(21)).toBe('из 21 участника');
    expect(RIDE_PAGE_TERMS.ofLimit(24)).toBe('из 24 участников');
  });

  it('agrees rider counts and says «Пока никого» for an empty group', () => {
    expect(RIDE_PAGE_TERMS.groupRiders(0)).toBe('Пока никого');
    expect(RIDE_PAGE_TERMS.groupRiders(1)).toBe('1 участник');
    expect(RIDE_PAGE_TERMS.groupRiders(3)).toBe('3 участника');
    expect(RIDE_PAGE_TERMS.groupRiders(11)).toBe('11 участников');
    expect(RIDE_PAGE_TERMS.ridersWord(22)).toBe('участника');
  });

  it('mentions the waitlist only when someone is in it', () => {
    expect(RIDE_PAGE_TERMS.seatsFull(0)).toBe('Мест нет');
    expect(RIDE_PAGE_TERMS.seatsFull(2)).toBe('Мест нет · 2 в очереди');
  });

  it('fills the group option and elevation range', () => {
    expect(RIDE_PAGE_TERMS.groupOption('Группа 1', '25 км/ч')).toBe(
      'Группа 1 · 25 км/ч',
    );
    expect(RIDE_PAGE_TERMS.elevationRange('210 м', '140 м')).toBe(
      'макс. 210 м · мин. 140 м',
    );
  });
});

describe('ORGANIZER_GROUPS_TERMS (CR-120)', () => {
  it('agrees the participant count', () => {
    expect(ORGANIZER_GROUPS_TERMS.participantsCount(1)).toBe('1 участник');
    expect(ORGANIZER_GROUPS_TERMS.participantsCount(4)).toBe('4 участника');
    expect(ORGANIZER_GROUPS_TERMS.participantsCount(7)).toBe('7 участников');
  });

  it('names the group in every action label', () => {
    expect(ORGANIZER_GROUPS_TERMS.defaultName(2)).toBe('Группа 2');
    expect(ORGANIZER_GROUPS_TERMS.editAria('Бодрая')).toBe(
      'Изменить группу «Бодрая»',
    );
    expect(ORGANIZER_GROUPS_TERMS.deleteAria('Бодрая')).toBe(
      'Удалить группу «Бодрая»',
    );
    expect(ORGANIZER_GROUPS_TERMS.moveUpAria('Бодрая')).toBe(
      'Переместить группу «Бодрая» выше',
    );
    expect(ORGANIZER_GROUPS_TERMS.moveDownAria('Бодрая')).toBe(
      'Переместить группу «Бодрая» ниже',
    );
    expect(ORGANIZER_GROUPS_TERMS.deleteConfirmTitle('Бодрая')).toBe(
      'Удалить группу «Бодрая»?',
    );
  });
});

describe('GARAGE_TERMS', () => {
  it('names the bike in every action label', () => {
    expect(GARAGE_TERMS.editAria('Trek Domane')).toBe(
      'Изменить велосипед «Trek Domane»',
    );
    expect(GARAGE_TERMS.deleteAria('Trek Domane')).toBe(
      'Удалить велосипед «Trek Domane»',
    );
    expect(GARAGE_TERMS.makeActiveAria('Trek Domane')).toBe(
      'Сделать «Trek Domane» активным велосипедом',
    );
    expect(GARAGE_TERMS.deleteConfirmTitle('Trek Domane')).toBe(
      'Удалить велосипед «Trek Domane»?',
    );
  });
});

describe('RIDE_CREATE_TERMS / RIDE_WIZARD_TERMS (CR-156)', () => {
  it('fills the draft and GPX templates', () => {
    expect(RIDE_CREATE_TERMS.draftSavedAt('14:05')).toBe(
      'Черновик сохранён в 14:05',
    );
    expect(RIDE_CREATE_TERMS.gpxSelected('loop.gpx')).toBe(
      'Выбран файл «loop.gpx»',
    );
    expect(RIDE_CREATE_TERMS.gpxUploadFailed('сеть недоступна')).toBe(
      'Черновик сохранён, но GPX не загрузился: сеть недоступна',
    );
  });

  it('counts wizard steps', () => {
    expect(RIDE_WIZARD_TERMS.stepCounter(2, 4)).toBe(
      'Новый заезд · шаг 2 из 4',
    );
  });
});

describe('RIDE_ROUTE_BUILDER_TERMS (CR-114)', () => {
  it('numbers points and states the limit', () => {
    expect(RIDE_ROUTE_BUILDER_TERMS.pointLabel(3)).toBe('Точка 3');
    expect(RIDE_ROUTE_BUILDER_TERMS.removePoint(3)).toBe('Удалить точку 3');
    expect(RIDE_ROUTE_BUILDER_TERMS.pointsCount(3, 25)).toBe('Точек: 3 из 25');
    expect(RIDE_ROUTE_BUILDER_TERMS.tooManyPoints(25)).toBe(
      'Можно поставить не больше 25 точек.',
    );
  });
});

describe('RIDE_DETAIL_RIDERS_TERMS / ORGANIZER_OVERVIEW_TERMS', () => {
  it('fills the riders group heading', () => {
    expect(
      RIDE_DETAIL_RIDERS_TERMS.groupHeading('Бодрая', '27,5 км/ч', 6),
    ).toBe('Бодрая · 27,5 км/ч — 6');
  });

  it('keeps the countdown unit on the same line as its number', () => {
    expect(ORGANIZER_OVERVIEW_TERMS.nearestInDays(2)).toBe('2 дн');
    expect(ORGANIZER_OVERVIEW_TERMS.nearestInHours(5)).toBe('5 ч');
  });
});
