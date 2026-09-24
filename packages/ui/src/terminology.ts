// Russian UI terminology mapping (CR-064, `docs/design.md` §13). Single source of truth
// for user-visible strings derived from a domain enum — the database keeps English
// enums, the UI maps through here. Do not invent synonyms per screen.

import type {
  BicycleType,
  DifficultyLevel,
  RideStatus,
  RoutePointType,
} from 'types';

// `RideStatus`/`BicycleType`/`DifficultyLevel` themselves moved to `packages/types`
// (CR-017, `.claude/context/current-task.md`): `apps/api` needs the same enums for
// Zod validation and `packages/db` needs the same value lists for its Postgres enums,
// but `apps/api` must never depend on `packages/ui`
// (`.claude/rules/architecture.md`). Re-exported here so nothing inside `packages/ui`
// that imported these types from this module before CR-017 has to change its import
// path. Only the Russian label maps below are genuinely UI-layer and stay defined
// here.
export type { BicycleType, DifficultyLevel, RideStatus, RoutePointType };

/**
 * Russian cardinal plural — `one` (1, 21), `few` (2–4, 22–24), `many` (0, 5–20,
 * 11–14…): the standard `n % 10`/`n % 100` rule (`docs/design.md` §7: "wrong
 * formatting here reads as broken software"). The one copy every count label in
 * this module uses.
 */
function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * CR-043 ("Organizer rating summary"): `1 отзыв`, `2 отзыва`, `5 отзывов`.
 */
function formatReviewsCount(count: number): string {
  return `${count} ${pluralRu(count, 'отзыв', 'отзыва', 'отзывов')}`;
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

export interface RideStatusTerm {
  label: string;
  tone: StatusTone;
}

/**
 * Ride lifecycle status labels. Enum keys match `docs/product.md`'s lifecycle
 * exactly: `draft → published → registration_open → registration_closed → started →
 * finished`, with `cancelled` reachable from `published`/`registration_open`/
 * `registration_closed`.
 */
export const RIDE_STATUS_TERMS: Record<RideStatus, RideStatusTerm> = {
  draft: { label: 'Черновик', tone: 'neutral' },
  published: { label: 'Опубликован', tone: 'success' },
  registration_open: { label: 'Регистрация открыта', tone: 'success' },
  registration_closed: { label: 'Регистрация закрыта', tone: 'warning' },
  started: { label: 'Заезд начался', tone: 'info' },
  finished: { label: 'Завершён', tone: 'neutral' },
  cancelled: { label: 'Отменён', tone: 'danger' },
};

/** Bicycle type labels. Enum keys match `docs/product.md` §Ride (`road, gravel, MTB,
 * any`). */
export const BICYCLE_TYPE_TERMS: Record<BicycleType, string> = {
  road: 'Шоссейный',
  gravel: 'Гравийный',
  mtb: 'Горный (MTB)',
  any: 'Любой',
};

/**
 * Ride services. `docs/product.md` §Services only names these in free-text English
 * (`food, water, coffee, support vehicle, mechanic, medical support, transfer, bicycle
 * transport, parking, changing room/shower`) — no `RideService` DB enum exists yet
 * (`packages/db` has zero domain tables). These snake_case keys are therefore
 * **provisional**, minted here to unblock CR-064; recorded as a known issue
 * (`known-issues.md`) so whichever CR defines the real DB enum either matches these
 * keys or this map gets updated to match it — do not let the two silently drift apart.
 */
export type RideServiceKey =
  | 'food'
  | 'water'
  | 'coffee'
  | 'support_vehicle'
  | 'mechanic'
  | 'medical_support'
  | 'transfer'
  | 'bicycle_transport'
  | 'parking'
  | 'changing_room';

export const RIDE_SERVICE_TERMS: Record<RideServiceKey, string> = {
  food: 'Питание',
  water: 'Вода',
  coffee: 'Кофе',
  support_vehicle: 'Машина сопровождения',
  mechanic: 'Механик',
  medical_support: 'Медицинская поддержка',
  transfer: 'Трансфер',
  bicycle_transport: 'Перевозка велосипедов',
  parking: 'Парковка',
  changing_room: 'Раздевалка и душ',
};

/**
 * Metric labels (`docs/design.md` §6's canonical `MetricRow` order). Not tied to a DB
 * enum — these are the tile labels themselves, in display order.
 */
export const METRIC_TERMS = {
  distance: 'Дистанция',
  elevation: 'Набор высоты',
  pace: 'Средний темп',
  duration: 'Длительность',
  difficulty: 'Сложность',
  participants: 'Участники',
} as const;

/**
 * Difficulty scale labels (`docs/design.md` §6, CR-065). A plain 1-5 integer, not a
 * DB enum — no provisional-key concern like {@link RideServiceKey}'s. Rendered as
 * filled/empty segments **plus** this word, never a color gradient and never color
 * alone (`DifficultyScale`).
 */
export const DIFFICULTY_LEVEL_TERMS: Record<DifficultyLevel, string> = {
  1: 'Лёгкий',
  2: 'Ниже среднего',
  3: 'Средний',
  4: 'Сложный',
  5: 'Очень сложный',
};

/**
 * Registration call-to-action/state labels. No `Registration` status enum exists yet
 * either — same provisional-key caveat as {@link RideServiceKey}.
 */
export type RegistrationActionKey =
  | 'register'
  | 'cancel'
  | 'waitlisted'
  | 'full'
  | 'joinWaitlist'
  | 'leaveWaitlist';

export const REGISTRATION_ACTION_TERMS: Record<RegistrationActionKey, string> =
  {
    register: 'Зарегистрироваться',
    cancel: 'Отменить регистрацию',
    waitlisted: 'В списке ожидания',
    full: 'Мест не осталось',
    joinWaitlist: 'Встать в список ожидания',
    leaveWaitlist: 'Покинуть список ожидания',
  };

/**
 * Generic, screen-independent UI strings (`docs/design.md` §10, CR-066) — e.g. the
 * retry affordance every `ErrorState` optionally offers. Screen-specific copy (an
 * `EmptyState`'s explanation of *why* it's empty, a particular error's message) is
 * deliberately NOT here: §10 requires that text to explain the specific situation,
 * which a generic label can't do, so it's always supplied by the caller instead.
 */
export const UI_TERMS = {
  retry: 'Повторить',
} as const;

/**
 * Register screen copy (CR-011, `.claude/rules/frontend.md`: no hard-coded
 * user-visible Russian string in a component). `emailAlreadyRegistered` maps
 * the API's `email_already_registered` domain code (`docs/api.md`) to a
 * field-level message; other server errors fall back to `genericError`.
 */
export const AUTH_TERMS = {
  emailLabel: 'Email',
  passwordLabel: 'Пароль',
  passwordHint: 'Минимум 12 символов.',
  registerSubmit: 'Зарегистрироваться',
  registerSubmitPending: 'Регистрация…',
  registerSuccessTitle: 'Аккаунт создан',
  registerSuccessBody:
    'Проверьте почту, чтобы подтвердить адрес и активировать аккаунт.',
  registerSuccessDevNote:
    'Только для этого окружения — ссылка для подтверждения:',
  emailAlreadyRegistered: 'Аккаунт с таким email уже существует.',
  genericError: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
  loginTitle: 'Вход',
  loginSubmit: 'Войти',
  loginSubmitPending: 'Вход…',
  invalidCredentials: 'Неверный email или пароль.',
  loginLink: 'Уже есть аккаунт? Войти',
  registerLink: 'Нет аккаунта? Зарегистрироваться',
  forgotPasswordLink: 'Забыли пароль?',
} as const;

/**
 * `/verify-email` (CR-099, closes KI-026's screen gap). `verifying` covers
 * the moment before `POST /v1/auth/verify-email` resolves; `missingToken`
 * covers a direct visit with no `?token=` in the URL, distinct from a real
 * server-side `invalid_or_expired_token` rejection.
 */
export const VERIFY_EMAIL_TERMS = {
  pageTitle: 'Подтверждение email',
  verifying: 'Подтверждаем адрес…',
  successTitle: 'Email подтверждён',
  successBody: 'Адрес подтверждён. Теперь можно пользоваться аккаунтом.',
  missingToken: 'Ссылка неполная — отсутствует код подтверждения.',
  invalidOrExpired:
    'Ссылка недействительна или уже была использована. Запросите новую при следующем входе.',
  genericError: 'Не удалось подтвердить email. Попробуйте ещё раз позже.',
  loginLink: 'Перейти ко входу',
} as const;

/** `/forgot-password` (CR-099, closes KI-042's screen gap). `.claude/rules/
 * security.md`: the success state must be identical whether or not the email
 * belongs to a real account — `successBody` never confirms account
 * existence. */
export const FORGOT_PASSWORD_TERMS = {
  pageTitle: 'Восстановление пароля',
  emailLabel: 'Email',
  submit: 'Отправить ссылку для сброса',
  submitPending: 'Отправка…',
  successTitle: 'Проверьте почту',
  successBody:
    'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля.',
  genericError: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
} as const;

/** `/reset-password` (CR-099, closes KI-042's screen gap). Same password
 * policy copy as `AUTH_TERMS.passwordHint` (12+ characters). */
export const RESET_PASSWORD_TERMS = {
  pageTitle: 'Новый пароль',
  passwordLabel: 'Новый пароль',
  passwordHint: 'Минимум 12 символов.',
  submit: 'Сохранить новый пароль',
  submitPending: 'Сохранение…',
  successTitle: 'Пароль изменён',
  successBody: 'Теперь можно войти с новым паролем.',
  missingToken: 'Ссылка неполная — отсутствует код сброса.',
  invalidOrExpired:
    'Ссылка недействительна или уже была использована. Запросите новую.',
  genericError: 'Не удалось сохранить пароль. Попробуйте ещё раз.',
  loginLink: 'Перейти ко входу',
} as const;

/**
 * The wordmark's accessible name (CR-121). The logo reads «кофе•райд», so the
 * name assistive tech announces matches the visible letters (WCAG 2.5.3).
 */
export const WORDMARK_TERMS = {
  name: 'Кофе Райд',
} as const;

/**
 * The one global header (CR-099, generalized by CR-108). Was a static
 * three-link bar shown only on `/`, `/register` and `/login`; CR-108 makes it
 * the app's single navigation surface on every route — `/rides/[id]` and the
 * auth sub-flows had no header at all, and both cabinets had only a side
 * column with no wordmark, no way to switch cabinets and no way to sign out.
 * Session-aware since CR-108: the signed-out links and the two cabinet menus
 * are mutually exclusive, so it resolves the session rather than showing all
 * of them unconditionally.
 */
export const SITE_HEADER_TERMS = {
  navLabel: 'Основная навигация',
  homeLink: 'Заезды',
  loginLink: 'Войти',
  registerLink: 'Регистрация',
  cabinetLink: 'Личный кабинет',
  // CR-108: the two registry-backed section menus, their overview entries,
  // and the account menu.
  participantMenuLabel: 'Участник',
  participantOverviewLink: 'Личный кабинет',
  organizerMenuLabel: 'Организатор',
  organizerOverviewLink: 'Кабинет организатора',
  accountMenuLabel: 'Аккаунт',
  logoutLink: 'Выйти',
  logoutError: 'Не удалось выйти. Попробуйте ещё раз.',
  // Mobile: the same sections behind one disclosure, since they cannot all
  // fit in the bar at 375px (`docs/design.md` §11).
  openMenuLabel: 'Открыть меню',
  closeMenuLabel: 'Закрыть меню',
} as const;

/**
 * Back links (CR-109). Every nested screen names the parent it returns to
 * rather than saying a bare "Назад" — a labeled destination survives a deep
 * link, which browser history does not: someone who opened `/rides/<id>` from
 * a shared URL has nothing to go back *to*.
 */
export const BACK_LINK_TERMS = {
  toDiscovery: 'Ко всем заездам',
  toOrganizerRides: 'К моим заездам',
  toOrganizerCabinet: 'В кабинет организатора',
  toParticipantCabinet: 'В личный кабинет',
  // CR-126: `/rides/[id]/riders/[registrationId]` back to the ride it was
  // opened from.
  toRide: 'К заезду',
} as const;

/**
 * Theme control (CR-110). `docs/design.md` §3's dark palette has existed since
 * CR-063 but followed `prefers-color-scheme` with no way to override it;
 * "системная" keeps that behavior as the default rather than replacing it.
 */
export const THEME_TERMS = {
  menuLabel: 'Тема оформления',
  system: 'Системная',
  light: 'Светлая',
  dark: 'Тёмная',
} as const;

/**
 * Cabinet shell (CR-013, `docs/design.md` §8): nav + the shared loading/error
 * states the shell shows while it resolves who's logged in. Separate from
 * `AUTH_TERMS` — this is cabinet-shell copy, not the login/register forms.
 */
export const CABINET_TERMS = {
  navLabel: 'Навигация личного кабинета',
  loadingCurrentUser: 'Загрузка личного кабинета…',
  loadCurrentUserError: 'Не удалось загрузить данные аккаунта.',
  homeTitle: 'Личный кабинет',
  homeEmptyTitle: 'Пока здесь нечего показать',
  homeEmptyDescription:
    'Управление профилем доступно в разделе «Профиль». Заезды и регистрации появятся здесь позже.',
  profileNavLabel: 'Профиль',
  // CR-091 ("My registrations"): the participant cabinet's second nav entry.
  myRegistrationsNavLabel: 'Мои регистрации',
  // CR-041 ("In-app notifications"): the participant cabinet's third nav entry.
  notificationsNavLabel: 'Уведомления',
  // CR-014: the organizer cabinet's one nav entry so far, and the CTA on the
  // participant cabinet home that's currently the only way to reach it
  // (`/organizer` itself has no dashboard content yet — CR-015).
  organizerProfileNavLabel: 'Профиль организатора',
  organizerCtaTitle: 'Организуете заезды?',
  organizerCtaDescription:
    'Создайте профиль организатора, чтобы публиковать заезды и управлять регистрациями.',
  organizerCtaLink: 'Профиль организатора',
  // `/organizer` page title (CR-014). Body content is now real widgets
  // (CR-015, `ORGANIZER_TERMS`'s `dashboardWidget*` entries) — the old stub
  // empty-state copy that used to fill this page is gone, replaced by the
  // widget grid's own states.
  organizerHomeTitle: 'Кабинет организатора',
  // CR-015: shown only if the widget registry is ever empty (defensive —
  // currently always has at least the profile summary widget).
  dashboardNoWidgetsTitle: 'Пока здесь нечего показать',
  dashboardNoWidgetsDescription:
    'Виджеты появятся здесь по мере добавления функций.',
  // CR-127: the account bar atop every cabinet screen.
  accountBarLabel: 'Текущий аккаунт',
  signedInAs: 'Вы вошли как',
  logoutButton: 'Выйти',
} as const;

/** `/me/profile` (CR-013, `docs/design.md` §8 "Profile settings"). */
export const PROFILE_TERMS = {
  pageTitle: 'Профиль',
  // CR-125: the primary identity shown in a ride's «Участники» list.
  firstNameLabel: 'Имя',
  lastNameLabel: 'Фамилия',
  nameHint: 'Показываются в списке участников заезда.',
  displayNameLabel: 'Отображаемое имя',
  displayNameHint:
    'Показывается в списке участников вместо имени и фамилии, если не заполнены.',
  phoneLabel: 'Телефон',
  phoneHint: 'Виден только вам — не показывается другим участникам.',
  bioLabel: 'О себе',
  bioHint: 'До 500 символов.',
  // CR-126: who can see this profile besides the owner — `ProfileVisibility`.
  profileVisibilityLabel: 'Видимость профиля',
  profileVisibilityClosed: 'Закрытый — видите только вы',
  profileVisibilityCoParticipants:
    'Только со-участники — видят те, с кем вы участвовали в заездах вместе',
  profileVisibilityOpen: 'Открытый — видят все участники платформы',
  // CR-126: self-reported distance stats, all optional.
  distanceWeekKmLabel: 'Км за неделю',
  distanceMonthKmLabel: 'Км за месяц',
  distanceYearKmLabel: 'Км за год',
  distanceStatsHint: 'Вносится вручную — необязательно.',
  saveSubmit: 'Сохранить',
  saveSubmitPending: 'Сохранение…',
  saveSuccess: 'Изменения сохранены.',
} as const;

// ---------------------------------------------------------------------------
// CR-126 ("garage"): the participant's own bikes, `/me/profile`'s `GarageForm`.
// Kept in its own block, separate from `PROFILE_TERMS` above, so a concurrent
// CR-126 edit to `packages/types/src/api/rider-profile.ts`'s terminology
// elsewhere in this file doesn't collide with it — see
// `.claude/context/current-task.md`.
// ---------------------------------------------------------------------------

/** `/me/profile`'s `GarageForm` (CR-126): list/add/edit/delete the participant's
 * bikes, and mark one active. Bike-type names themselves reuse the existing
 * `BICYCLE_TYPE_TERMS` map — this block only adds what's specific to the garage
 * UI (labels, actions, empty/error/confirm copy). */
export const GARAGE_TERMS = {
  sectionTitle: 'Гараж',
  hint: 'Велосипеды, которые вы используете на заездах.',
  loadError: 'Не удалось загрузить гараж. Попробуйте ещё раз.',
  emptyTitle: 'Велосипедов пока нет',
  emptyDescription: 'Добавьте велосипед, чтобы использовать его в заездах.',
  addButton: 'Добавить велосипед',
  addTitle: 'Новый велосипед',
  editTitle: 'Изменение велосипеда',
  bikeTypeLabel: 'Тип',
  brandLabel: 'Марка',
  modelLabel: 'Модель',
  save: 'Сохранить',
  create: 'Добавить',
  pending: 'Сохранение…',
  cancel: 'Отмена',
  edit: 'Изменить',
  delete: 'Удалить',
  editAria: (label: string) => `Изменить велосипед «${label}»`,
  deleteAria: (label: string) => `Удалить велосипед «${label}»`,
  makeActiveButton: 'Сделать активным',
  makeActiveAria: (label: string) => `Сделать «${label}» активным велосипедом`,
  activeLabel: 'Активный',
  unnamedBike: 'Без марки и модели',
  createSuccess: 'Велосипед добавлен.',
  updateSuccess: 'Изменения сохранены.',
  deleteSuccess: 'Велосипед удалён.',
  deleteConfirmTitle: (label: string) => `Удалить велосипед «${label}»?`,
  deleteConfirmDescription: 'Это действие нельзя отменить.',
  deleteConfirmAction: 'Удалить велосипед',
  bikeLimitReached: 'Достигнут предел — не больше 20 велосипедов.',
  genericError: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
} as const;

/**
 * `/organizer/profile` (CR-014, `docs/design.md` §8 "Organizer profile"). One screen
 * covers both states: no profile yet (create) and an existing one (edit) — see
 * `OrganizerProfileForm`.
 */
export const ORGANIZER_TERMS = {
  pageTitle: 'Профиль организатора',
  nameLabel: 'Название',
  nameHint: 'Имя, клуб или магазин — видно всем на странице заезда.',
  descriptionLabel: 'Описание',
  descriptionHint: 'До 500 символов.',
  createSubmit: 'Создать профиль',
  createSubmitPending: 'Создание…',
  createSuccess: 'Профиль организатора создан.',
  saveSubmit: 'Сохранить',
  saveSubmitPending: 'Сохранение…',
  saveSuccess: 'Изменения сохранены.',
  emailVerificationRequired:
    'Подтвердите email, чтобы создать профиль организатора. Ссылка для подтверждения была отправлена при регистрации.',
  loadError: 'Не удалось загрузить профиль организатора.',
  // CR-015: `/organizer` dashboard widget summarizing the same
  // `OrganizerProfile` this feature module owns (`OrganizerProfileWidget`) —
  // distinct copy from the `/organizer/profile` form above since it's a
  // read-only card, not a form.
  dashboardWidgetTitle: 'Профиль организатора',
  dashboardWidgetEmptyTitle: 'Профиль организатора ещё не создан',
  dashboardWidgetEmptyDescription:
    'Создайте профиль, чтобы публиковать заезды под своим именем.',
  dashboardWidgetCreateLink: 'Создать профиль',
  dashboardWidgetEditLink: 'Редактировать',
  // CR-043 ("Organizer rating summary"): shown on `/organizer/profile` alongside
  // the form, read-only — same "no reviews yet" missing-value handling as
  // `formatRatingParts`.
  ratingLabel: 'Рейтинг',
  ratingNoReviews: 'Пока нет отзывов',
  ratingReviewsCount: formatReviewsCount,
} as const;

/**
 * CR-097 (KI-023 remainder): shared between `/me/profile` and `/organizer/
 * profile`'s avatar upload UI — identical wording either way, same "share
 * via packages/ui" precedent `RIDE_COVER_TERMS` would follow if a second
 * cover-image screen ever needed it. No `notEditable`/draft-gate copy here —
 * unlike a ride cover, an avatar has no draft state to gate on.
 */
export const AVATAR_TERMS = {
  emptyDescription: 'Загрузите изображение (JPEG, PNG или WebP).',
  uploadLabel: 'Файл изображения',
  upload: 'Загрузить фото',
  uploadPending: 'Загрузка…',
  uploadSuccess: 'Фото загружено.',
  replace: 'Заменить фото',
  replacePending: 'Замена…',
  replaceSuccess: 'Фото обновлено.',
  delete: 'Удалить фото',
  deletePending: 'Удаление…',
  deleteSuccess: 'Фото удалено.',
  deleteConfirm: 'Удалить загруженное фото? Это действие необратимо.',
  avatarMissing: 'Выберите файл изображения для загрузки.',
  avatarInvalid: 'Файл не распознан как изображение JPEG, PNG или WebP.',
  avatarTooLarge: 'Файл превышает допустимый размер (8 МБ).',
  storageUnavailable: 'Загрузка недоступна. Попробуйте ещё раз позже.',
  genericError: 'Не удалось выполнить запрос. Попробуйте ещё раз.',
} as const;

export interface TimezoneOption {
  /** IANA identifier, e.g. `Asia/Krasnoyarsk` — what actually gets stored/sent
   * (ADR-012 §2). */
  value: string;
  /** Russian city name, e.g. `Красноярск (UTC+7)` — what the organizer picks from. */
  label: string;
}

/**
 * The 11 real Russian IANA timezones (CR-017, ADR-012: "Russia spans eleven
 * offsets"), not a raw `Intl.supportedValuesOf('timeZone')` dump (~400 entries) —
 * `docs/product.md`'s market/locale is Russian specifically, so the picker is scoped
 * to what an organizer here actually needs. None of these observe DST (Russia
 * abolished it in 2014), so each offset is fixed year-round. Server-side validation
 * (`packages/types`' `createRideRequestSchema`) stays loose and accepts any IANA zone
 * `Intl` recognizes — this list is a UI convenience, not the API contract.
 */
export const RUSSIAN_TIMEZONE_OPTIONS: readonly TimezoneOption[] = [
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
];

/** `/organizer/rides/new` (CR-017, `docs/design.md` §8 "Create ride"). Only the
 * fields a valid draft needs at creation — see `.claude/context/current-task.md`. */
export const RIDE_CREATE_TERMS = {
  pageTitle: 'Новый заезд',
  titleLabel: 'Название',
  titleHint: 'До 140 символов.',
  bicycleTypeLabel: 'Тип велосипеда',
  startsAtLabel: 'Дата и время старта',
  startsAtRequired: 'Укажите дату и время старта.',
  startTimezoneLabel: 'Часовой пояс старта',
  summaryBicycleTypeLabel: 'Тип велосипеда',
  summaryStartLabel: 'Старт',
  submit: 'Создать черновик',
  submitPending: 'Создание…',
  organizerProfileRequired:
    'Чтобы создать заезд, сначала создайте профиль организатора.',
  createOrganizerProfileLink: 'Создать профиль организатора',
  loadError: 'Не удалось создать заезд. Попробуйте ещё раз.',
  successTitle: 'Черновик заезда создан',
  backToDashboard: 'Вернуться в кабинет',
  // CR-088: both the edit screen and the rides list exist now — the success view
  // closes the loop instead of only pointing back at the dashboard.
  editRideLink: 'Редактировать заезд',
  allRidesLink: 'Все мои заезды',
} as const;

/** `/organizer/rides` (CR-088, `docs/design.md` §8 "My rides, grouped by status"). */
export const RIDE_LIST_TERMS = {
  pageTitle: 'Мои заезды',
  createLink: 'Новый заезд',
  loadError: 'Не удалось загрузить список заездов. Попробуйте ещё раз.',
  emptyTitle: 'Пока нет ни одного заезда',
  emptyDescription: 'Создайте первый заезд, чтобы он появился здесь.',
  summaryStartLabel: 'Старт',
} as const;

/**
 * CR-103 (`/impeccable critique` P1 — "organizer dashboard has no glanceable
 * status"): `/organizer` dashboard widget summarizing `GET /v1/rides/mine/summary`
 * across every ride the caller organizes — `MetricTile`/`MetricRow` (§6), same
 * primitive `docs/design.md`'s own metric system already establishes, applied to a
 * ride/registration/waitlist count instead of one ride's own distance/elevation/pace.
 */
export const RIDE_SUMMARY_WIDGET_TERMS = {
  title: 'Мои заезды',
  loadError: 'Не удалось загрузить сводку по заездам.',
  totalRidesLabel: 'Всего заездов',
  openRegistrationLabel: 'Открыта регистрация',
  activeRegistrationsLabel: 'Зарегистрировано',
  waitlistedLabel: 'В листе ожидания',
} as const;

/** `/organizer/rides/[id]/edit` (CR-018, `docs/design.md` §8 "Edit draft"). Every
 * field CR-017 deliberately left `null` at creation — see
 * `.claude/context/current-task.md`. */
export const RIDE_EDIT_TERMS = {
  pageTitle: 'Редактирование заезда',
  notFoundTitle: 'Заезд не найден',
  notFoundDescription:
    'Такого заезда нет, либо он принадлежит другому организатору.',
  backToList: 'К списку заездов',
  loadError: 'Не удалось загрузить заезд. Попробуйте ещё раз.',
  titleLabel: 'Название',
  descriptionLabel: 'Описание',
  descriptionHint: 'До 2000 символов.',
  bicycleTypeLabel: 'Тип велосипеда',
  startsAtLabel: 'Дата и время старта',
  startsAtRequired: 'Укажите дату и время старта.',
  startTimezoneLabel: 'Часовой пояс старта',
  participantLimitLabel: 'Лимит участников',
  priceRubLabel: 'Стоимость участия, ₽',
  distanceKmLabel: 'Дистанция, км',
  elevationGainMetersLabel: 'Набор высоты, м',
  paceKmhLabel: 'Средняя скорость, км/ч',
  durationMinutesLabel: 'Длительность, мин',
  difficultyLabel: 'Сложность',
  difficultyNotSet: 'Не указана',
  // CR-125: per-ride privacy toggle for the participant-facing «Участники» list.
  participantsVisibleLabel: 'Показывать список участников',
  participantsVisibleHint:
    'Участники смогут видеть имена и фамилии друг друга в списке «Участники». Число мест видно всегда.',
  // CR-026 ("Map discovery"), ADR-014: manual coordinate entry — no geocode-by-
  // address UI yet (KI-016).
  startLatLabel: 'Широта старта',
  startLngLabel: 'Долгота старта',
  // CR-027 ("GPX upload"): link into `/organizer/rides/[id]/route`.
  routeLink: 'Маршрут →',
  // ADR-019/CR-086 ("Cover image"): link into `/organizer/rides/[id]/cover`.
  coverLink: 'Обложка →',
  // CR-037 ("Organizer participant list"): link into
  // `/organizer/rides/[id]/participants`.
  participantsLink: 'Участники →',
  // CR-039 ("Ride updates"): link into `/organizer/rides/[id]/updates`.
  updatesLink: 'Обновления →',
  notEditable: 'Редактировать можно только черновик заезда.',
  save: 'Сохранить',
  savePending: 'Сохранение…',
  saveSuccess: 'Изменения сохранены.',
  // CR-019 ("Publish ride").
  publish: 'Опубликовать',
  publishPending: 'Публикация…',
  publishSuccess: 'Заезд опубликован.',
  publishEmailVerificationRequired:
    'Подтвердите email, чтобы опубликовать заезд. Ссылка для подтверждения была отправлена при регистрации.',
  // CR-089 ("Open registration") / CR-020 ("Close registration").
  openRegistration: 'Открыть регистрацию',
  openRegistrationPending: 'Открытие регистрации…',
  openRegistrationSuccess: 'Регистрация открыта.',
  closeRegistration: 'Закрыть регистрацию',
  closeRegistrationPending: 'Закрытие регистрации…',
  closeRegistrationSuccess: 'Регистрация закрыта.',
  // CR-021 ("Cancel ride").
  cancel: 'Отменить заезд',
  cancelPending: 'Отмена…',
  cancelSuccess: 'Заезд отменён.',
  cancelConfirm:
    'Отменить заезд? Это действие необратимо, участники увидят статус «Отменён».',
  // CR-090 ("Start ride") / CR-022 ("Finish ride").
  start: 'Начать заезд',
  startPending: 'Запуск…',
  startSuccess: 'Заезд начат.',
  finish: 'Завершить заезд',
  finishPending: 'Завершение…',
  finishSuccess: 'Заезд завершён.',
} as const;

/**
 * `/rides/[id]` (CR-023, `docs/design.md` §8 "Ride detail"). Public, participant-
 * facing — distinct copy from `RIDE_EDIT_TERMS`'s organizer-only not-found message
 * (that one names "belongs to another organizer"; here a draft/non-existent/other-
 * organizer's-draft ride are all the same "not available" state to a viewer who was
 * never going to be told which). Services/requirements/waitlist still have no data
 * model yet (CR-036..); route/stops (CR-027/030) and registration (CR-032/033) do.
 */
export const RIDE_DETAIL_TERMS = {
  notFoundTitle: 'Заезд не найден',
  notFoundDescription: 'Такого заезда нет, либо он больше не доступен.',
  loadError: 'Не удалось загрузить заезд. Попробуйте ещё раз.',
  organizedByLabel: 'Организатор',
  startLabel: 'Старт',
  priceLabel: 'Стоимость участия',
  bicycleTypeLabel: 'Тип велосипеда',
  // CR-032 ("Register"): `METRIC_TERMS.participants` + `formatParticipantsParts`
  // replaced this screen's old bare-number `participantLimitLabel` tile with a
  // registered/capacity ratio ("12 из 20") — `RIDE_EDIT_TERMS.participantLimitLabel`
  // (organizer edit form's field label) is a separate key, unaffected.
  //
  // Shared by `RegistrationButton`'s register/cancel actions — one generic
  // action-failure fallback, not a dedicated string per button, same precedent as
  // `RIDE_EDIT_TERMS.loadError` (`EditRideForm`'s publish/open/close/cancel handlers
  // all reuse that one key too).
  registrationActionError: 'Не удалось выполнить действие. Попробуйте ещё раз.',
  // CR-043 ("Organizer rating summary"): shown next to `organizedByLabel`.
  ratingReviewsCount: formatReviewsCount,
  // CR-103 (`ConfirmDialog`/`Toast`, `/impeccable critique` P0): confirmation copy for
  // the two destructive `RegistrationButton` actions, and success feedback for all
  // four state-changing ones. `confirmLabel` on each dialog reuses
  // `REGISTRATION_ACTION_TERMS.cancel`/`.leaveWaitlist` rather than duplicating the
  // button label.
  cancelConfirmTitle: 'Отменить регистрацию?',
  cancelConfirmDescription:
    'Вы потеряете место в заезде. Если места ещё останутся, можно будет зарегистрироваться повторно.',
  leaveWaitlistConfirmTitle: 'Покинуть список ожидания?',
  leaveWaitlistConfirmDescription: 'Вы потеряете место в очереди.',
  keepLabel: 'Остаться',
  registerSuccess: 'Вы зарегистрированы на заезд.',
  cancelSuccess: 'Регистрация отменена.',
  joinWaitlistSuccess: 'Вы в списке ожидания.',
  leaveWaitlistSuccess: 'Вы покинули список ожидания.',
} as const;

/**
 * `/` (CR-024, `docs/design.md` §8 "Discovery" — the list-only slice of it; the map
 * toggle is CR-026, filters are CR-025). `GET /v1/rides` only ever returns non-draft
 * rides, so there is no "unauthorized" state here, unlike every cabinet list.
 */
export const RIDE_DISCOVERY_TERMS = {
  pageTitle: 'Заезды',
  loadError: 'Не удалось загрузить заезды. Попробуйте ещё раз.',
  emptyTitle: 'Пока нет заездов',
  emptyDescription:
    'Загляните позже — организаторы скоро опубликуют новые заезды.',
  organizedByLabel: 'Организатор',
  // CR-025 ("Filters"): exact copy `docs/design.md` §10 and `EmptyState`'s own doc
  // comment already quote for the filtered-empty state, distinct from the plain
  // `emptyTitle` above (no filter active).
  filterAllOption: 'Все типы',
  emptyFilteredTitle: 'Пока нет заездов по этим фильтрам',
  resetFiltersLabel: 'Сбросить фильтры',
  // ADR-024 («Ночной старт»): the "Заезды / Карта" tab switch above the two
  // discovery views — a card grid (`RideGrid`) and the map-first list
  // (`DiscoveryList`, unchanged, ADR-021/CR-118's view). Revives CR-026's
  // never-wired-up List/Map toggle terms with the new labels.
  tabsLabel: 'Режим просмотра',
  viewGridLabel: 'Заезды',
  viewMapLabel: 'Карта',
  mapUnavailable: 'Карта временно недоступна. Используйте список заездов.',
  // CR-123: the map-fullscreen toggle on the discovery map panel.
  expandMapLabel: 'Развернуть карту на весь экран',
  collapseMapLabel: 'Свернуть карту',
  // ADR-024: the route-cover grid's compact status chip — "мало мест" sits
  // between `registration_open`'s ordinary label and `registration_closed`'s
  // "Регистрация закрыта"; derived from seats left, not a `RideStatus` value.
  lowSeatsLabel: 'Мало мест',
} as const;

/**
 * `/organizer/rides/[id]/route` (CR-027, `docs/design.md` §8 "Route, GPX upload,
 * stops, route points" — this ticket ships the GPX upload slice only; stops/route
 * points are CR-030/CR-031). Draft-only, same gate `RIDE_EDIT_TERMS` uses for the
 * rest of ride configuration. `storageUnavailable` is the exact degraded-state copy
 * `docs/design.md` §10 already names for an S3 failure.
 */
export const RIDE_ROUTE_TERMS = {
  pageTitle: 'Маршрут',
  backToEdit: 'К редактированию заезда',
  loadError: 'Не удалось загрузить заезд. Попробуйте ещё раз.',
  notEditable: 'Маршрут можно менять только у черновика заезда.',
  emptyTitle: 'Маршрут ещё не загружен',
  emptyDescription: 'Загрузите трек в формате GPX, чтобы добавить маршрут.',
  uploadLabel: 'Файл GPX',
  upload: 'Загрузить трек',
  uploadPending: 'Загрузка…',
  uploadSuccess: 'Маршрут загружен.',
  replace: 'Заменить трек',
  replacePending: 'Замена…',
  replaceSuccess: 'Маршрут обновлён.',
  delete: 'Удалить маршрут',
  deletePending: 'Удаление…',
  deleteSuccess: 'Маршрут удалён.',
  deleteConfirm: 'Удалить загруженный маршрут? Это действие необратимо.',
  download: 'Скачать трек (GPX)',
  distanceLabel: 'Дистанция трека',
  elevationGainLabel: 'Набор высоты трека',
  pointCountLabel: 'Точек трека',
  fileNameLabel: 'Файл',
  gpxFileMissing: 'Выберите файл GPX для загрузки.',
  gpxInvalid: 'Файл не распознан как корректный GPX-трек.',
  gpxFileTooLarge: 'Файл превышает допустимый размер.',
  storageUnavailable: 'Загрузка недоступна. Попробуйте ещё раз позже.',
  // CR-029 ("Route metadata", resolves KI-034): shown only when the ride's own
  // distance/elevation (organizer-entered, `EditRideForm`) diverge from the
  // uploaded track's computed values — an upload with both fields still empty
  // auto-fills them server-side, so this note is the deliberate-mismatch case only.
  metricsMismatch:
    'Дистанция или набор высоты заезда отличаются от данных трека.',
  metricsMismatchRide: 'В заезде указано',
  metricsMismatchTrack: 'по треку',
  metricsSyncAction: 'Использовать данные трека',
  metricsSyncSuccess: 'Дистанция и набор высоты заезда обновлены из трека.',
} as const;

/**
 * CR-114 ("Route builder"): `/organizer/rides/[id]/route`'s map-based route
 * construction — the organizer clicks waypoints, the API routes them along
 * 2GIS roads. Separate from `RIDE_ROUTE_TERMS` (the GPX upload flow).
 */
export const RIDE_ROUTE_BUILDER_TERMS = {
  sectionTitle: 'Построить по карте',
  description:
    'Нажимайте на карту, чтобы расставить точки: старт, промежуточные и финиш. Маршрут проложится только по дорогам и дорожкам 2GIS.',
  mapLabel: 'Карта для построения маршрута',
  pointLabel: (index: number) => `Точка ${index}`,
  removePoint: (index: number) => `Удалить точку ${index}`,
  pointsCount: (count: number, max: number) => `Точек: ${count} из ${max}`,
  emptyPoints: 'Точек пока нет — нажмите на карту.',
  needMorePoints: 'Нужно минимум две точки.',
  tooManyPoints: (max: number) => `Можно поставить не больше ${max} точек.`,
  undo: 'Убрать последнюю',
  clear: 'Очистить',
  closeLoop: 'Замкнуть круг',
  build: 'Построить маршрут',
  buildPending: 'Строим маршрут…',
  buildSuccess: 'Маршрут построен по дорогам 2GIS.',
  notBuildable:
    'Между этими точками нет проезда по дорогам 2GIS. Передвиньте точку ближе к дороге и попробуйте снова.',
  unavailable: 'Построение маршрута временно недоступно. Попробуйте позже.',
  mapUnavailable: 'Карта недоступна — построить маршрут сейчас нельзя.',
} as const;

/**
 * `/organizer/rides/[id]/cover` (ADR-019/CR-086, `docs/design.md` §14). Same
 * shape as `RIDE_ROUTE_TERMS` — one image field, create/replace/delete.
 */
export const RIDE_COVER_TERMS = {
  pageTitle: 'Обложка заезда',
  backToEdit: 'К редактированию заезда',
  loadError: 'Не удалось загрузить заезд. Попробуйте ещё раз.',
  notEditable: 'Обложку можно менять только у черновика заезда.',
  emptyTitle: 'Обложка ещё не загружена',
  emptyDescription:
    'Загрузите изображение (JPEG, PNG или WebP), чтобы добавить обложку.',
  uploadLabel: 'Файл изображения',
  upload: 'Загрузить обложку',
  uploadPending: 'Загрузка…',
  uploadSuccess: 'Обложка загружена.',
  replace: 'Заменить обложку',
  replacePending: 'Замена…',
  replaceSuccess: 'Обложка обновлена.',
  delete: 'Удалить обложку',
  deletePending: 'Удаление…',
  deleteSuccess: 'Обложка удалена.',
  deleteConfirm: 'Удалить загруженную обложку? Это действие необратимо.',
  coverImageMissing: 'Выберите файл изображения для загрузки.',
  coverImageInvalid: 'Файл не распознан как изображение JPEG, PNG или WebP.',
  coverImageTooLarge: 'Файл превышает допустимый размер (8 МБ).',
  storageUnavailable: 'Загрузка недоступна. Попробуйте ещё раз позже.',
} as const;

/**
 * `/rides/[id]`'s "Маршрут" section (CR-028, `docs/design.md` §6 "Elevation
 * profile"/§8 "route + profile"). Participant-facing — distinct from `RIDE_ROUTE_TERMS`
 * above (CR-027's organizer-facing upload screen). No live 2GIS credential in this
 * environment (KI-031/KI-016), so `mapUnavailable` is a real, live-verified degraded
 * state, not a placeholder for a future one.
 */
export const ROUTE_RENDERING_TERMS = {
  sectionTitle: 'Маршрут',
  elevationProfileLabel: 'Профиль высоты',
  elevationProfileLoadError:
    'Не удалось загрузить профиль высоты. Попробуйте ещё раз.',
  mapUnavailable: 'Карта маршрута временно недоступна.',
  // Heading for the map panel when a ride has a start point/stops on the map
  // but no uploaded route line yet.
  startLocationTitle: 'Место старта',
} as const;

/**
 * CR-030 ("Stops"). Shared between the organizer's management UI
 * (`/organizer/rides/[id]/route`, same screen as `RIDE_ROUTE_TERMS` — `docs/design.md`
 * §8 groups "Route, GPX upload, stops, route points" together) and the
 * participant-facing `StopList` on `/rides/[id]`.
 */
export const STOPS_TERMS = {
  sectionTitle: 'Остановки',
  emptyTitle: 'Остановки ещё не добавлены',
  emptyDescription: 'Например, кофейня или смотровая площадка на маршруте.',
  addButton: 'Добавить остановку',
  nameLabel: 'Название',
  descriptionLabel: 'Описание',
  latLabel: 'Широта',
  lngLabel: 'Долгота',
  durationLabel: 'Длительность, мин',
  save: 'Сохранить',
  savePending: 'Сохранение…',
  saveSuccess: 'Остановка сохранена.',
  cancel: 'Отмена',
  edit: 'Изменить',
  delete: 'Удалить',
  deletePending: 'Удаление…',
  deleteSuccess: 'Остановка удалена.',
  deleteConfirm: 'Удалить остановку? Это действие необратимо.',
  loadError: 'Не удалось сохранить остановку. Попробуйте ещё раз.',
  notEditable: 'Остановки можно менять только у черновика заезда.',
} as const;

/**
 * CR-031 ("Route points"): the eight marker types `docs/database.md`'s `RoutePoint`
 * names, same "database keeps English enums, UI maps through here" rule as
 * `BICYCLE_TYPE_TERMS`/`RIDE_STATUS_TERMS` above.
 */
export const ROUTE_POINT_TYPE_TERMS: Record<RoutePointType, string> = {
  start: 'Старт',
  finish: 'Финиш',
  stop: 'Остановка',
  danger: 'Опасный участок',
  water: 'Вода',
  food: 'Еда',
  technical: 'Техническая точка',
  other: 'Другое',
};

/**
 * `/organizer/rides/[id]/route`'s route-points management, alongside `StopsSection`
 * (`docs/design.md` §8 groups "GPX upload, stops, route points" on one screen). No
 * participant-facing list exists for this ticket — route points are map pins, and the
 * map itself is a documented degraded placeholder pending a live 2GIS credential
 * (KI-031); see `.claude/context/current-task.md`'s scope decision.
 */
export const ROUTE_POINT_TERMS = {
  sectionTitle: 'Точки маршрута',
  emptyTitle: 'Точки маршрута ещё не добавлены',
  emptyDescription: 'Например, опасный участок или родник на маршруте.',
  addButton: 'Добавить точку',
  typeLabel: 'Тип',
  labelLabel: 'Название',
  descriptionLabel: 'Описание',
  latLabel: 'Широта',
  lngLabel: 'Долгота',
  save: 'Сохранить',
  savePending: 'Сохранение…',
  saveSuccess: 'Точка маршрута сохранена.',
  cancel: 'Отмена',
  edit: 'Изменить',
  delete: 'Удалить',
  deletePending: 'Удаление…',
  deleteSuccess: 'Точка маршрута удалена.',
  deleteConfirm: 'Удалить точку маршрута? Это действие необратимо.',
  loadError: 'Не удалось сохранить точку маршрута. Попробуйте ещё раз.',
  notEditable: 'Точки маршрута можно менять только у черновика заезда.',
} as const;

/**
 * `/organizer/rides/[id]/participants` (CR-037, `docs/design.md` §8 "Participants +
 * waitlist"). Read-only — no removal/messaging action asked for by any doc
 * (`.claude/context/current-task.md`'s scope decision). `noNameFallback` covers a
 * participant who never set `displayName` (`packages/db/src/schema/user.ts`:
 * nullable) — shown in place of a blank name, never an empty cell.
 */
export const PARTICIPANTS_TERMS = {
  pageTitle: 'Участники',
  loadError: 'Не удалось загрузить список участников. Попробуйте ещё раз.',
  noNameFallback: 'Без имени',
  participantsSectionTitle: 'Участники',
  participantsEmptyTitle: 'Пока никто не зарегистрирован',
  participantsEmptyDescription:
    'Здесь появятся участники после того, как кто-то зарегистрируется на заезд.',
  waitlistSectionTitle: 'Лист ожидания',
  waitlistEmptyTitle: 'Лист ожидания пуст',
  waitlistEmptyDescription:
    'Здесь появятся участники, если заезд заполнится и кто-то встанет в очередь.',
  joinedAtLabel: 'Дата регистрации',
} as const;

// ---------------------------------------------------------------------------
// CR-120 (organizer: pace-groups editor + group on the participants page).
// Kept in one block so concurrent CR-118/CR-119 edits elsewhere in this file
// don't collide with it.
// ---------------------------------------------------------------------------

/** `7 участников`, `1 участник`, `3 участника`. */
function formatGroupParticipantsCount(count: number): string {
  return `${count} ${pluralRu(count, 'участник', 'участника', 'участников')}`;
}

/**
 * `/organizer/rides/[id]/groups` (CR-120, ADR-022). Error copy is keyed by the
 * API's stable `code` (`docs/api.md` → "Pace groups"), never by `detail`.
 */
export const ORGANIZER_GROUPS_TERMS = {
  pageTitle: 'Группы по темпу',
  // Link from the ride edit screen's sub-page list (next to «Маршрут →»).
  rideEditLink: 'Группы →',
  backToEdit: 'К редактированию заезда',
  hint: 'Если в заезде есть группы, участник при регистрации обязательно выбирает одну из них.',
  loadError: 'Не удалось загрузить группы. Попробуйте ещё раз.',
  emptyTitle: 'Групп нет — все участники едут вместе.',
  emptyDescription: 'Добавьте группы, если заезд делится по темпу.',
  addButton: 'Добавить группу',
  addTitle: 'Новая группа',
  editTitle: 'Изменение группы',
  defaultName: (index: number) => `Группа ${index}`,
  nameLabel: 'Название',
  paceLabel: 'Средняя скорость, км/ч',
  paceHint: 'От 5 до 60 км/ч, шаг 0,5. Например, 27,5.',
  descriptionLabel: 'Описание (необязательно)',
  descriptionHint:
    'Например: без остановок, темп держим ровно. До 500 символов.',
  save: 'Сохранить',
  create: 'Добавить',
  pending: 'Сохранение…',
  cancel: 'Отмена',
  edit: 'Изменить',
  delete: 'Удалить',
  editAria: (name: string) => `Изменить группу «${name}»`,
  deleteAria: (name: string) => `Удалить группу «${name}»`,
  moveUpAria: (name: string) => `Переместить группу «${name}» выше`,
  moveDownAria: (name: string) => `Переместить группу «${name}» ниже`,
  participantsCount: formatGroupParticipantsCount,
  createSuccess: 'Группа добавлена.',
  updateSuccess: 'Изменения сохранены.',
  deleteSuccess: 'Группа удалена.',
  reorderSuccess: 'Порядок групп изменён.',
  deleteConfirmTitle: (name: string) => `Удалить группу «${name}»?`,
  deleteConfirmDescription:
    'Группа исчезнет из заезда. Удалить можно только группу без участников.',
  deleteConfirmAction: 'Удалить группу',
  limitNotice: 'Добавлено максимальное число групп — 6.',
  notEditable: 'Заезд завершён или отменён — группы больше нельзя менять.',
  // Client validation (mirrors `createRideGroupRequestSchema`).
  nameRequired: 'Укажите название группы.',
  nameTooLong: 'Название — не длиннее 60 символов.',
  paceRequired: 'Укажите среднюю скорость.',
  paceNotNumber: 'Введите число, например 27,5.',
  paceOutOfRange: 'Скорость — от 5 до 60 км/ч.',
  paceStep: 'Скорость указывается с шагом 0,5 км/ч.',
  descriptionTooLong: 'Описание — не длиннее 500 символов.',
  // Server error `code` → message.
  groupNameTaken: 'Группа с таким названием уже есть',
  groupLimitReached: 'Не больше 6 групп',
  groupHasRegistrations:
    'В группе есть участники — сначала переведите их или отмените регистрации',
  genericError: 'Не удалось сохранить изменения. Попробуйте ещё раз.',
} as const;

/** `/organizer/rides/[id]/participants`'s group field/headings (CR-120). */
export const PARTICIPANTS_GROUP_TERMS = {
  groupLabel: 'Группа',
  noGroup: '—',
  ungroupedHeading: 'Без группы',
  participantsCount: formatGroupParticipantsCount,
} as const;

// --------------------------- end CR-120 block ------------------------------

/**
 * `/me/rides` (CR-091, `docs/design.md` §8 "My registrations — Upcoming / past
 * tabs"). Read-only, links out to each ride's own `/rides/[id]` page for cancellation
 * (`.claude/context/current-task.md`'s scope decision) — this screen has no register/
 * cancel action of its own.
 */
export const MY_REGISTRATIONS_TERMS = {
  pageTitle: 'Мои регистрации',
  tabUpcoming: 'Предстоящие',
  tabPast: 'Прошедшие',
  loadError: 'Не удалось загрузить регистрации. Попробуйте ещё раз.',
  emptyUpcomingTitle: 'Нет предстоящих регистраций',
  emptyUpcomingDescription:
    'Зарегистрируйтесь на заезд в разделе «Заезды», чтобы увидеть его здесь.',
  emptyPastTitle: 'Пока нет прошедших заездов',
  emptyPastDescription:
    'Здесь появятся заезды, в которых вы уже приняли участие.',
} as const;

/**
 * `/organizer/rides/[id]/updates` (CR-039, `docs/design.md` §8 "Ride updates
 * composer", §9's `UpdateComposer`). No edit/delete of a sent update — only
 * compose + history (`.claude/context/current-task.md`'s scope decision).
 */
export const RIDE_UPDATES_TERMS = {
  pageTitle: 'Обновления заезда',
  backToEdit: 'К редактированию заезда',
  messageLabel: 'Сообщение участникам',
  messagePlaceholder: 'Например: старт перенесён на 9:00.',
  send: 'Отправить',
  sendPending: 'Отправка…',
  sendSuccess: 'Обновление отправлено участникам.',
  historyTitle: 'История обновлений',
  historyLoadError:
    'Не удалось загрузить историю обновлений. Попробуйте ещё раз.',
  historyEmptyTitle: 'Обновлений пока нет',
  historyEmptyDescription: 'Отправленные участникам сообщения появятся здесь.',
} as const;

/**
 * `/me/notifications` (CR-041, `docs/design.md` §8 "In-app notifications").
 * Per-type label shown above the ride title (`.claude/context/current-task.md`:
 * no unread-count badge, no bulk "mark all read" in this ticket — click a card to
 * mark it read).
 */
/**
 * `/rides/[id]`'s "Отзывы" section (CR-042, `docs/design.md` §9's `ReviewForm`).
 * `ReviewForm` shows only when the viewer is eligible (active registration on a
 * `finished` ride) and hasn't reviewed yet — no separate "ineligible" copy is needed,
 * the form is simply absent (`.claude/context/current-task.md`'s scope decision).
 */
export const REVIEWS_TERMS = {
  sectionTitle: 'Отзывы',
  loadError: 'Не удалось загрузить отзывы. Попробуйте ещё раз.',
  emptyTitle: 'Пока нет отзывов',
  emptyDescription: 'Станьте первым, кто оставит отзыв об этом заезде.',
  ratingLabel: 'Оценка',
  commentLabel: 'Комментарий',
  commentPlaceholder: 'Поделитесь впечатлениями о заезде (необязательно).',
  submit: 'Оставить отзыв',
  submitPending: 'Отправка…',
  submitSuccess: 'Спасибо за отзыв!',
  submitError: 'Не удалось отправить отзыв. Попробуйте ещё раз.',
  alreadyReviewed: 'Вы уже оставили отзыв об этом заезде.',
} as const;

export const NOTIFICATIONS_TERMS = {
  pageTitle: 'Уведомления',
  loadError: 'Не удалось загрузить уведомления. Попробуйте ещё раз.',
  emptyTitle: 'Пока нет уведомлений',
  emptyDescription:
    'Здесь будут появляться подтверждения регистрации, обновления и отмены заездов.',
  registrationConfirmedLabel: 'Регистрация подтверждена',
  rideUpdateLabel: 'Обновление по заезду',
  rideCancelledLabel: 'Заезд отменён',
  unreadLabel: 'Новое',
} as const;

// ---------------------------------------------------------------------------
// CR-119 (ride detail «Топокарта»: pace groups, registered state, «Участники»).
// Kept in one block so concurrent CR-118/CR-120 edits elsewhere in this file
// don't collide with it.
// ---------------------------------------------------------------------------

function rideDetailRidersCount(count: number): string {
  return `${count} ${pluralRu(count, 'участник', 'участника', 'участников')}`;
}

/** `/rides/[id]`'s «Группы» block and group choice at registration (CR-119). */
export const RIDE_DETAIL_GROUP_TERMS = {
  sectionTitle: 'Группы',
  pickLegend: 'Выберите группу',
  pickHint: 'Выберите группу, чтобы записаться',
  ridersCount: rideDetailRidersCount,
  yourGroup: 'Ваша группа',
  ridingIn: (name: string, pace: string) =>
    `Вы едете в группе «${name}» · ${pace}`,
  changeGroup: 'Сменить группу',
  saveGroup: 'Сохранить',
  cancelChange: 'Отмена',
  changeSuccess: 'Группа изменена.',
  // Registered before the organizer added groups (`groupId === null`).
  noGroupTitle: 'Выберите группу',
  noGroupDescription:
    'Организатор разделил заезд на группы по темпу. Выберите, с какой группой вы поедете.',
  // API `code` → message (`docs/api.md` → Registration, CR-117).
  groupRequired: 'Чтобы записаться, выберите группу.',
  groupNotFound:
    'Этой группы больше нет в заезде. Обновите страницу и выберите другую.',
  groupChangeNotAllowed:
    'Заезд завершён или отменён — группу больше нельзя сменить.',
} as const;

/** `/rides/[id]`'s registration slot, registered state and route panel (CR-119). */
export const RIDE_DETAIL_REGISTRATION_TERMS = {
  seatsLeft: (count: number) =>
    `Осталось ${count} ${pluralRu(count, 'место', 'места', 'мест')}`,
  registeredTitle: 'Вы зарегистрированы',
  whenLabel: 'Когда',
  startLabel: 'Старт',
  groupLabel: 'Группа',
  downloadGpx: 'Скачать GPX',
  aboutTitle: 'О заезде',
  legendTitle: 'Условные знаки',
  stopDuration: 'Стоянка',
} as const;

/** `/rides/[id]`'s «Участники» section — `GET /v1/rides/:id/riders` (CR-119). */
export const RIDE_DETAIL_RIDERS_TERMS = {
  sectionTitle: 'Участники',
  noName: 'Участник без имени',
  noGroup: 'Без группы',
  ridersCount: rideDetailRidersCount,
  groupHeading: (name: string, pace: string, count: number) =>
    `${name} · ${pace} — ${count}`,
  signInPrompt: 'Войдите, чтобы увидеть список',
  // CR-125: the organizer turned off `Ride.participantsVisible`.
  hiddenByOrganizer: 'Организатор скрыл список участников этого заезда.',
  showMore: 'Показать ещё',
  loadError: 'Не удалось загрузить список участников. Попробуйте ещё раз.',
  emptyTitle: 'Пока никто не записался',
  emptyDescription:
    'Здесь появятся участники, когда кто-нибудь зарегистрируется.',
} as const;

// --------------------------- end CR-119 block ------------------------------

// ---------------------------------------------------------------------------
// CR-126 (rider profile card, `/rides/[id]/riders/[registrationId]`). Kept in
// its own block, separate from the concurrent CR-126 "garage" edits to
// `PROFILE_TERMS`/`GARAGE_TERMS` above (that's `/me/profile`'s own-profile
// settings screen, a different feature module) — see
// `.claude/context/current-task.md`. Denial states reuse
// `RIDE_DETAIL_RIDERS_TERMS.hiddenByOrganizer`/`signInPrompt` directly rather
// than duplicating that copy.
// ---------------------------------------------------------------------------

export const RIDER_PROFILE_TERMS = {
  bioLabel: 'О себе',
  garageTitle: 'Гараж',
  noBikes: 'Пока нет добавленных велосипедов.',
  unnamedBike: 'Без марки и модели',
  activeBikeLabel: 'Активный',
  // Distance stats are `MetricTile`s — the unit («км») is rendered separately
  // by `formatDistanceParts`, so these labels name only the period.
  distanceWeekLabel: 'За неделю',
  distanceMonthLabel: 'За месяц',
  distanceYearLabel: 'За год',
  recentRidesTitle: 'Недавние заезды',
  recentRidesEmpty: 'Недавних заездов пока нет.',
  // `403 profile_private`: the rider's own `profileVisibility` doesn't grant
  // this viewer access — distinct from `hiddenByOrganizer` (the organizer
  // hid the whole list) above.
  profilePrivateTitle: 'Профиль закрыт',
  profilePrivateDescription: 'Участник ограничил доступ к своему профилю.',
  // `404 rider_not_found`.
  notFoundTitle: 'Участник не найден',
  notFoundDescription: 'Такого участника больше нет в этом заезде.',
  loadError: 'Не удалось загрузить профиль участника. Попробуйте ещё раз.',
} as const;

// --------------------------- end CR-126 block ------------------------------

// ---------------------------------------------------------------------------
// CR-118 (discovery «Топокарта»: legend rows, start-time pins, list↔map sync).
// Kept in one block so concurrent CR-119/CR-120 edits elsewhere in this file
// don't collide with it.
// ---------------------------------------------------------------------------

/** `/`'s legend-row ride list and discovery map (CR-118, `docs/design.md` §8). */
export const RIDE_DISCOVERY_ROW_TERMS = {
  // «Старт: Парк Горького» — the ride's `start` route-point label.
  startPrefix: 'Старт',
  seatsLeft: (count: number) =>
    `Осталось ${count} ${pluralRu(count, 'место', 'места', 'мест')}`,
  noSeats: 'Мест нет',
  groupsCount: (count: number) =>
    `${count} ${pluralRu(count, 'группа', 'группы', 'групп')}`,
  // The unfiltered empty list — the map «sheet» has no rides on it.
  emptyTitle: 'Заездов на этом листе нет',
  // The map region's accessible name (it is `role="img"`; the list is its
  // keyboard/screen-reader equivalent, `docs/design.md` §12).
  mapLabel: 'Карта стартов заездов',
  listLabel: 'Список заездов',
  // Mobile: the ride card raised over the map after a pin tap.
  closeSelected: 'Скрыть карточку заезда',
} as const;

// --------------------------- end CR-118 block ------------------------------
