import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LEGAL_DOCUMENTS, type LegalDocumentType } from 'types';
import { LEGAL_TERMS } from 'ui';
import { LegalDocument } from './components/LegalDocument';
import { LegalDocumentPage } from './components/LegalDocumentPage';
import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENT_TEXT } from './content';

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
vi.mock('next/navigation', () => ({ notFound }));

// CR-247, CR-268 (ADR-041): `/terms`, `/privacy`, `/personal-data-consent` —
// versioned, with their history, readable without signing in.

const TITLES: Record<LegalDocumentType, string> = {
  terms: LEGAL_TERMS.termsTitle,
  privacy: LEGAL_TERMS.privacyTitle,
  personal_data_consent: LEGAL_TERMS.personalDataConsentTitle,
};

function textOf(type: LegalDocumentType): string {
  const versions = LEGAL_DOCUMENTS[type].versions;
  return JSON.stringify(
    LEGAL_DOCUMENT_TEXT[type][versions[versions.length - 1]!.version],
  );
}

describe('LegalDocument', () => {
  it.each(Object.entries(TITLES) as [LegalDocumentType, string][])(
    '%s: one h1, its sections, the version line, the history and the contact',
    (type, title) => {
      const html = renderToStaticMarkup(
        <LegalDocument type={type} title={title} />,
      );
      const content = LEGAL_DOCUMENT_TEXT[type]['1.0']!;
      expect(html.match(/<h1/g)).toHaveLength(1);
      // One h2 per section plus «История версий».
      expect(html.match(/<h2/g)).toHaveLength(content.sections.length + 1);
      expect(html).toContain('Версия 1.0, действует с 15 октября 2026');
      expect(html).toContain(LEGAL_TERMS.historyTitle);
      expect(html).toContain(LEGAL_TERMS.historyCurrent);
      expect(html).toContain(`mailto:${LEGAL_CONTACT_EMAIL}`);
      expect(html).not.toContain(LEGAL_TERMS.archivedNotice);
    },
  );

  it('marks an earlier version and links back to the current one', () => {
    const original = LEGAL_DOCUMENTS.terms;
    const text = LEGAL_DOCUMENT_TEXT.terms;
    LEGAL_DOCUMENTS.terms = {
      ...original,
      versions: [
        ...original.versions,
        {
          version: '2.0',
          effectiveAt: '2027-01-01',
          sha256: 'f'.repeat(64),
          material: true,
          summary: 'Новая редакция.',
        },
      ],
    };
    LEGAL_DOCUMENT_TEXT.terms = { ...text, '2.0': text['1.0']! };
    try {
      const archived = renderToStaticMarkup(
        <LegalDocument type="terms" title="T" version="1.0" />,
      );
      expect(archived).toContain(LEGAL_TERMS.archivedNotice);
      expect(archived).toContain('href="/terms"');
      expect(archived).toContain('Версия 1.0, действует с');

      const current = renderToStaticMarkup(
        <LegalDocument type="terms" title="T" />,
      );
      expect(current).toContain('Версия 2.0, действует с 1 января 2027');
      expect(current).toContain('href="/terms?version=1.0"');
    } finally {
      LEGAL_DOCUMENTS.terms = original;
      LEGAL_DOCUMENT_TEXT.terms = text;
    }
  });

  it('404s an unknown ?version= instead of showing the current text under it', async () => {
    await expect(
      LegalDocumentPage({
        type: 'privacy',
        title: 'P',
        searchParams: Promise.resolve({ version: '9.9' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(
      LegalDocumentPage({
        type: 'privacy',
        title: 'P',
        searchParams: Promise.resolve({ version: ['1.0', '2.0'] }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    const page = await LegalDocumentPage({
      type: 'privacy',
      title: 'P',
      searchParams: Promise.resolve({ version: '1.0' }),
    });
    expect(renderToStaticMarkup(page)).toContain('Версия 1.0');
  });
});

describe('document contents (prompt 4 checklist)', () => {
  it('the terms cover every required topic', () => {
    const text = textOf('terms');
    for (const topic of [
      'Что делает сервис',
      'Аккаунт и возраст',
      'Правила для организаторов',
      'Правила для участников',
      'Безопасность на заезде',
      'Ваш контент',
      'Что запрещено',
      'Модерация и обжалование',
      'Отмены',
      'Сторонние сервисы',
      'Доступность сервиса',
      'Прекращение аккаунта',
      'Изменение условий',
      'Применимое право',
      'Контакты',
    ]) {
      expect(text).toContain(topic);
    }
  });

  it('the privacy policy covers every required topic', () => {
    const text = textOf('privacy');
    for (const topic of [
      'Оператор',
      'Чьи данные',
      'Какие данные',
      'Цели и правовые основания',
      'Что мы делаем с данными',
      'Откуда данные',
      'Кто видит и получает данные',
      'Где хранятся данные',
      'Сколько мы храним',
      'Cookies',
      'oauth-signup',
      'reCAPTCHA',
      'Unisender Go',
      '2ГИС',
      'Strava',
      'Резервные копии',
      'Журналы сервера',
      'Как мы защищаем данные',
      'Ваши права',
      'Удаление аккаунта',
      'Инциденты',
      'Несовершеннолетние',
      'Изменения политики',
    ]) {
      expect(text).toContain(topic);
    }
    // Information, not an agreement: the consent is its own document.
    expect(text).toContain('Согласие на обработку персональных данных');
  });

  it('the consent names purposes, data, actions, recipients, term and withdrawal', () => {
    const text = textOf('personal_data_consent');
    for (const topic of [
      'Цели',
      'Какие данные',
      'Действия и способ обработки',
      'Кому могут передаваться данные',
      'Срок и отзыв согласия',
      'Как фиксируется согласие',
    ]) {
      expect(text).toContain(topic);
    }
  });

  it('records no IP address or browser data with an acceptance, as the policy says', () => {
    expect(textOf('privacy')).toContain(
      'IP-адрес и данные браузера при этом не записываются',
    );
  });
});
