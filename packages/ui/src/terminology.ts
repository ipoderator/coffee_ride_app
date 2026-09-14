// Russian UI terminology mapping (CR-064, `docs/design.md` §13). Single source of truth
// for user-visible strings derived from a domain enum — the database keeps English
// enums, the UI maps through here. Do not invent synonyms per screen.

import type { BicycleType, DifficultyLevel, RideStatus } from 'types';

// `RideStatus`/`BicycleType`/`DifficultyLevel` themselves moved to `packages/types`
// (CR-017, `.claude/context/current-task.md`): `apps/api` needs the same enums for
// Zod validation and `packages/db` needs the same value lists for its Postgres enums,
// but `apps/api` must never depend on `packages/ui`
// (`.claude/rules/architecture.md`). Re-exported here so nothing inside `packages/ui`
// that imported these types from this module before CR-017 has to change its import
// path. Only the Russian label maps below are genuinely UI-layer and stay defined
// here.
export type { BicycleType, DifficultyLevel, RideStatus };

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
  'register' | 'cancel' | 'waitlisted' | 'full';

export const REGISTRATION_ACTION_TERMS: Record<RegistrationActionKey, string> =
  {
    register: 'Зарегистрироваться',
    cancel: 'Отменить регистрацию',
    waitlisted: 'В списке ожидания',
    full: 'Мест не осталось',
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
} as const;

/** `/me/profile` (CR-013, `docs/design.md` §8 "Profile settings"). */
export const PROFILE_TERMS = {
  pageTitle: 'Профиль',
  displayNameLabel: 'Имя',
  displayNameHint: 'Видно другим участникам заезда.',
  phoneLabel: 'Телефон',
  phoneHint: 'Виден только вам — не показывается другим участникам.',
  bioLabel: 'О себе',
  bioHint: 'До 500 символов.',
  saveSubmit: 'Сохранить',
  saveSubmitPending: 'Сохранение…',
  saveSuccess: 'Изменения сохранены.',
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
  notEditable: 'Редактировать можно только черновик заезда.',
  save: 'Сохранить',
  savePending: 'Сохранение…',
  saveSuccess: 'Изменения сохранены.',
} as const;
