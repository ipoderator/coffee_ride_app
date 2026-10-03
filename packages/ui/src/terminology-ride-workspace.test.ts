import { describe, expect, it } from 'vitest';
import {
  RIDE_READINESS_TERMS,
  RIDE_UPDATES_TERMS,
  RIDE_WORKSPACE_TERMS,
  VALIDATION_TERMS,
} from './terminology';

// CR-187's ride workspace copy (KI-085: left untested by CR-187 — the
// coverage gate caught it). Each line is checked as the organizer reads it.

describe('RIDE_WORKSPACE_TERMS', () => {
  it('names the head action and the overview facts', () => {
    expect(RIDE_WORKSPACE_TERMS.participantsAction(12)).toBe('Участники · 12');
    expect(RIDE_WORKSPACE_TERMS.factRouteValue('42 км', '380 м')).toBe(
      '42 км · 380 м набора',
    );
    expect(RIDE_WORKSPACE_TERMS.factRouteValue('42 км', null)).toBe('42 км');
    expect(RIDE_WORKSPACE_TERMS.factPlacesLimited(8, 20, 2)).toBe(
      '8 из 20 занято · лист ожидания: 2',
    );
    expect(RIDE_WORKSPACE_TERMS.factPlacesUnlimited(8, 0)).toBe(
      '8 записано, без ограничения · лист ожидания: 0',
    );
    expect(RIDE_WORKSPACE_TERMS.rowActionLabel('Добавить', 'Маршрут')).toBe(
      'Добавить — Маршрут',
    );
  });
});

describe('RIDE_READINESS_TERMS', () => {
  it('lists only the route facts it has', () => {
    expect(RIDE_READINESS_TERMS.route.readyDetail('42 км', '380 м', 2)).toBe(
      '42 км · 380 м набора · 2 остановки',
    );
    expect(RIDE_READINESS_TERMS.route.readyDetail('42 км', null, 0)).toBe(
      '42 км',
    );
    expect(RIDE_READINESS_TERMS.route.readyDetail('42 км', null, 5)).toBe(
      '42 км · 5 остановок',
    );
  });

  it('counts groups and riders with the right plural', () => {
    expect(RIDE_READINESS_TERMS.groups.readyTitle(1)).toBe('1 группа по темпу');
    expect(RIDE_READINESS_TERMS.groups.readyTitle(3)).toBe('3 группы по темпу');
    expect(RIDE_READINESS_TERMS.groups.readyChip(3, 6)).toBe('3 из 6');

    const { participants } = RIDE_READINESS_TERMS;
    expect(participants.registeredTitle(1)).toBe('1 участник записался');
    expect(participants.registeredTitle(5)).toBe('5 участников записались');
    expect(participants.registeredChip(0)).toBe('Никто не записан');
    expect(participants.registeredChip(21)).toBe('21 записался');
    expect(participants.registeredChip(3)).toBe('3 записались');
    expect(participants.placesLimited(12, 20, 1)).toBe(
      'Свободно 12 из 20 · лист ожидания: 1',
    );
    expect(participants.placesUnlimited(0)).toBe(
      'Без ограничения мест · лист ожидания: 0',
    );
    expect(participants.startedDetail(4, 9)).toBe('Итоговый статус у 4 из 9');
    expect(participants.unresolvedChip(5)).toBe('Не отмечено: 5');
    expect(participants.finishedDetail(7, 1, 2)).toBe(
      'Финиш: 7 · сошли: 1 · не пришли: 2',
    );
    expect(participants.unconfirmedChip(2)).toBe('Не подтверждено: 2');
  });

  it('quotes the latest update', () => {
    expect(
      RIDE_READINESS_TERMS.updates.latestDetail('вчера', 'Сбор в 7:30'),
    ).toBe('вчера · «Сбор в 7:30»');
    expect(RIDE_READINESS_TERMS.updates.latestChip('1 окт')).toBe(
      'Последнее: 1 окт',
    );
  });
});

describe('RIDE_UPDATES_TERMS.recipients', () => {
  it('says who receives the update, or that nobody will', () => {
    expect(RIDE_UPDATES_TERMS.recipients(0)).toBe(
      'Сейчас никто не записан — сообщение никто не получит.',
    );
    expect(RIDE_UPDATES_TERMS.recipients(1)).toBe(
      'Получит 1 записавшийся участник. Проверьте текст перед отправкой.',
    );
    expect(RIDE_UPDATES_TERMS.recipients(11)).toBe(
      'Получат 11 записавшихся участников. Проверьте текст перед отправкой.',
    );
    expect(RIDE_UPDATES_TERMS.recipients(22)).toBe(
      'Получат 22 записавшихся участника. Проверьте текст перед отправкой.',
    );
  });
});

describe('RIDE_UPDATES_TERMS.sendSuccess (CR-192)', () => {
  it('reports the real result, never «участникам» for nobody', () => {
    expect(RIDE_UPDATES_TERMS.sendSuccess(0)).toBe(
      'Обновление опубликовано; получателей пока нет.',
    );
    expect(RIDE_UPDATES_TERMS.sendSuccess(1)).toBe(
      'Обновление отправлено: получит 1 записавшийся участник.',
    );
    expect(RIDE_UPDATES_TERMS.sendSuccess(3)).toBe(
      'Обновление отправлено: получат 3 записавшихся участника.',
    );
    expect(RIDE_UPDATES_TERMS.sendSuccess(11)).toBe(
      'Обновление отправлено: получат 11 записавшихся участников.',
    );
    expect(RIDE_UPDATES_TERMS.sendSuccess(21)).toBe(
      'Обновление отправлено: получит 21 записавшийся участник.',
    );
  });

  it('claims no recipients when the count is unknown', () => {
    expect(RIDE_UPDATES_TERMS.sendSuccess()).toBe('Обновление опубликовано.');
  });
});

describe('VALIDATION_TERMS numeric bounds (KI-085)', () => {
  it('groups thousands and keeps the sign', () => {
    expect(VALIDATION_TERMS.atLeast(-90)).toBe('Не меньше -90.');
    expect(VALIDATION_TERMS.atMost(10000)).toBe('Не больше 10 000.');
  });
});
