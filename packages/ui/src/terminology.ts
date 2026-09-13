// Russian UI terminology mapping (CR-064, `docs/design.md` §13). Single source of truth
// for user-visible strings derived from a domain enum — the database keeps English
// enums, the UI maps through here. Do not invent synonyms per screen.

export type StatusTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger';

/**
 * Ride lifecycle status. Enum keys match `docs/product.md`'s lifecycle exactly:
 * `draft → published → registration_open → registration_closed → started → finished`,
 * with `cancelled` reachable from `published`/`registration_open`/`registration_closed`.
 */
export type RideStatus =
  | 'draft'
  | 'published'
  | 'registration_open'
  | 'registration_closed'
  | 'started'
  | 'finished'
  | 'cancelled';

export interface RideStatusTerm {
  label: string;
  tone: StatusTone;
}

export const RIDE_STATUS_TERMS: Record<RideStatus, RideStatusTerm> = {
  draft: { label: 'Черновик', tone: 'neutral' },
  published: { label: 'Опубликован', tone: 'success' },
  registration_open: { label: 'Регистрация открыта', tone: 'success' },
  registration_closed: { label: 'Регистрация закрыта', tone: 'warning' },
  started: { label: 'Заезд начался', tone: 'info' },
  finished: { label: 'Завершён', tone: 'neutral' },
  cancelled: { label: 'Отменён', tone: 'danger' },
};

/** Bicycle type. Enum keys match `docs/product.md` §Ride (`road, gravel, MTB, any`). */
export type BicycleType = 'road' | 'gravel' | 'mtb' | 'any';

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
 * Difficulty scale (`docs/design.md` §6, CR-065). A plain 1-5 integer, not a DB enum —
 * no provisional-key concern like {@link RideServiceKey}'s. Rendered as filled/empty
 * segments **plus** this word, never a color gradient and never color alone
 * (`DifficultyScale`).
 */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

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
