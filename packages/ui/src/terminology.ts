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
 * CR-043 ("Organizer rating summary"): correct Russian plural for a review count —
 * `1 отзыв`, `2 отзыва`, `5 отзывов` (standard `n % 10`/`n % 100` cardinal rule,
 * `docs/design.md` §7: "wrong formatting here reads as broken software").
 */
function formatReviewsCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'отзыв'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'отзыва'
        : 'отзывов';
  return `${count} ${word}`;
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
  // CR-043 ("Organizer rating summary"): shown on `/organizer/profile` alongside
  // the form, read-only — same "no reviews yet" missing-value handling as
  // `formatRatingParts`.
  ratingLabel: 'Рейтинг',
  ratingNoReviews: 'Пока нет отзывов',
  ratingReviewsCount: formatReviewsCount,
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
  // CR-026 ("Map discovery"): the List/Map toggle (`docs/design.md` §8). No live
  // 2GIS credential is configured in this environment (KI-016), so the map view
  // shows a degraded notice instead of attempting a real map render
  // (`.claude/rules/resilience.md`).
  viewListLabel: 'Список',
  viewMapLabel: 'Карта',
  mapUnavailable: 'Карта временно недоступна. Используйте список заездов.',
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
