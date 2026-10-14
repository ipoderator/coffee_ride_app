import { describe, expect, it } from 'vitest';
import { SYSTEM_STATUS_TERMS } from './terminology';

// CR-265: the auth mockup's «Техработы» tab, word for word, and its error sibling.
describe('system status terms (CR-265)', () => {
  it('words the maintenance screen like the mockup', () => {
    expect(SYSTEM_STATUS_TERMS.maintenance.title).toBe(
      'Технический пит-стоп. Скоро снова в путь.',
    );
    expect(SYSTEM_STATUS_TERMS.maintenance.body).toBe(
      'Мы обновляем Кофе Райд, чтобы сервис работал стабильнее. Ваши аккаунты, регистрации и заезды сохранены.',
    );
    expect(SYSTEM_STATUS_TERMS.maintenance.status).toBe(
      'Плановые технические работы',
    );
    expect(SYSTEM_STATUS_TERMS.refresh).toBe('Обновить страницу');
    expect(SYSTEM_STATUS_TERMS.contact).toBe('Написать нам');
  });

  it('gives the unexpected error its own words, none of them technical', () => {
    const { error, maintenance } = SYSTEM_STATUS_TERMS;
    expect(error.title).not.toBe(maintenance.title);
    expect(error.status).not.toBe(maintenance.status);
    for (const text of Object.values(error)) {
      expect(text).not.toMatch(/\b(500|503|error|exception|stack|digest)\b/i);
    }
  });
});
