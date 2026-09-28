import postgres from 'postgres';

// CR-148. Demo data for local development: organizers, participants, rides in
// every lifecycle state, pace groups, stops, route points, registrations, a
// waitlist, ride updates and reviews. `pnpm seed:demo` (root).
//
// Everything goes through the running app's HTTP API (`pnpm dev`), never
// straight into the tables, so every business rule, the route preview and the
// GPX in S3 are produced exactly as for a real organizer. Routes are built by
// the app's own route builder (`POST /v1/rides/:id/route/build`, 2GIS roads,
// bicycle) — so the API must reach 2GIS (KI-056: not through this machine's
// VPN). The first build doubles as a preflight: if 2GIS is unreachable the run
// stops before anything is published (`pnpm seed:demo --no-routes` skips it).
//
// Only the reset step touches the database directly: it deletes every
// `@demo.coffeeride.local` account and its rides, so a re-run starts clean.
// GPX/cover objects of deleted rides stay in the dev bucket (harmless).
//
// Faster with the dev-only rate-limit overrides from `.env.example`
// (`AUTH_RATE_LIMIT_MAX`, `RATE_LIMIT_MAX`); without them a 429 is waited out.

const DEMO_DOMAIN = 'demo.coffeeride.local';
const DEMO_PASSWORD = 'demo-coffee-ride-2026';
const API_URL = process.env.SEED_API_URL ?? 'http://localhost:4000';
// The API's CSRF check (ADR-013) wants a same-origin `Origin` on every unsafe
// method — what the browser sends from the web app.
const WEB_ORIGIN = process.env.SEED_WEB_ORIGIN ?? 'http://localhost:3000';
const TIMEZONE = 'Europe/Moscow';
// `--no-routes`: everything except the route builder step — for when 2GIS is
// unreachable (KI-056). Rides then have no route line on the map.
const SKIP_ROUTES = process.argv.includes('--no-routes');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocal(): string {
  // Same root `.env` apps/api reads; already-set variables win.
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No .env — rely on the environment.
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:demo refuses to run with NODE_ENV=production.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (dev database).');
  for (const url of [databaseUrl, API_URL]) {
    if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
      throw new Error(`seed:demo only runs against localhost, not ${url}.`);
    }
  }
  return databaseUrl;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T = unknown>(
  method: string,
  path: string,
  options: { session?: string; body?: unknown } = {},
): Promise<{ data: T; setCookie: string[] }> {
  for (;;) {
    const headers: Record<string, string> = {};
    if (method !== 'GET') headers.origin = WEB_ORIGIN;
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.session) headers.cookie = `session=${options.session}`;

    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after')) || 60;
      console.log(`  rate limit — waiting ${wait}s (see AUTH_RATE_LIMIT_MAX)`);
      await sleep(wait * 1000);
      continue;
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data?.code,
        `${method} ${path} → ${response.status} ${data?.code ?? ''} ${data?.detail ?? ''}`,
      );
    }
    return { data: data as T, setCookie: response.headers.getSetCookie() };
  }
}

// ── Accounts ─────────────────────────────────────────────────────────────────

interface Person {
  key: string;
  firstName: string;
  lastName: string;
  bio?: string;
  bike?: { bikeType: 'road' | 'gravel' | 'mtb'; brand: string; model: string };
  monthKm?: number;
}

interface Account {
  key: string;
  session: string;
  name: string;
}

async function createAccount(person: Person): Promise<Account> {
  const email = `${person.key}@${DEMO_DOMAIN}`;
  const { data: registered } = await api<{ verificationUrl?: string }>(
    'POST',
    '/v1/auth/register',
    { body: { email, password: DEMO_PASSWORD } },
  );
  if (!registered.verificationUrl) {
    throw new Error('register returned no verificationUrl (production API?).');
  }
  const token = new URL(registered.verificationUrl, API_URL).searchParams.get(
    'token',
  );
  await api('POST', '/v1/auth/verify-email', { body: { token } });

  const { setCookie } = await api('POST', '/v1/auth/login', {
    body: { email, password: DEMO_PASSWORD },
  });
  const session = setCookie
    .map((cookie) => /^session=([^;]+)/.exec(cookie)?.[1])
    .find(Boolean);
  if (!session) throw new Error(`login for ${email} set no session cookie.`);

  await api('PATCH', '/v1/users/me', {
    session,
    body: {
      firstName: person.firstName,
      lastName: person.lastName,
      bio: person.bio ?? null,
      profileVisibility: 'co_participants',
      distanceMonthKm: person.monthKm ?? null,
    },
  });
  if (person.bike) {
    await api('POST', '/v1/users/me/bikes', {
      session,
      body: { ...person.bike, isActive: true },
    });
  }
  return {
    key: person.key,
    session,
    name: `${person.firstName} ${person.lastName}`,
  };
}

// ── Data ─────────────────────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

// Landmarks used as waypoints. Consecutive waypoints stay under 50 km apart:
// the current 2GIS key is a demo key (KI-075).
const P = {
  patriarchs: { lat: 55.7637, lng: 37.5926 },
  redSquare: { lat: 55.7539, lng: 37.6208 },
  gorkyPark: { lat: 55.7312, lng: 37.6034 },
  neskuchny: { lat: 55.72, lng: 37.59 },
  sparrowHills: { lat: 55.7106, lng: 37.5536 },
  luzhniki: { lat: 55.7158, lng: 37.5537 },
  krymskyBridge: { lat: 55.7355, lng: 37.6 },
  mnevniki: { lat: 55.776, lng: 37.475 },
  serebryanyBor: { lat: 55.778, lng: 37.43 },
  strogino: { lat: 55.8038, lng: 37.403 },
  krylatskoye: { lat: 55.7615, lng: 37.433 },
  altufyevo: { lat: 55.899, lng: 37.587 },
  dolgoprudny: { lat: 55.938, lng: 37.513 },
  lobnya: { lat: 56.012, lng: 37.474 },
  iksha: { lat: 56.17, lng: 37.5 },
  dmitrov: { lat: 56.344, lng: 37.52 },
  sokolniki: { lat: 55.793, lng: 37.677 },
  losinyBiostation: { lat: 55.829, lng: 37.737 },
  losinyNorth: { lat: 55.862, lng: 37.72 },
  kolomenskoye: { lat: 55.667, lng: 37.67 },
  tsaritsyno: { lat: 55.615, lng: 37.682 },
  odintsovo: { lat: 55.678, lng: 37.278 },
  zhavoronki: { lat: 55.64, lng: 37.1 },
  zvenigorod: { lat: 55.73, lng: 36.857 },
  kurskaya: { lat: 55.758, lng: 37.659 },
  smolenskaya: { lat: 55.748, lng: 37.583 },
  oktyabrskaya: { lat: 55.729, lng: 37.611 },
  taganskaya: { lat: 55.74, lng: 37.653 },
} satisfies Record<string, LatLng>;

const ORGANIZERS: (Person & { profile: string; about: string })[] = [
  {
    key: 'org.north',
    firstName: 'Андрей',
    lastName: 'Лебедев',
    profile: 'Северный велоклуб',
    about:
      'Шоссейные выезды на север Подмосковья: темповые группы, обязательные шлемы, кофе на финише.',
    bike: { bikeType: 'road', brand: 'Canyon', model: 'Endurace CF 7' },
    monthKm: 900,
  },
  {
    key: 'org.gravel',
    firstName: 'Мария',
    lastName: 'Соколова',
    profile: 'Гравий по выходным',
    about:
      'Гравийные маршруты по паркам и лесам Москвы. Никого не бросаем, темп — по самому медленному.',
    bike: { bikeType: 'gravel', brand: 'Specialized', model: 'Diverge' },
    monthKm: 600,
  },
  {
    key: 'org.coffee',
    firstName: 'Илья',
    lastName: 'Ким',
    profile: 'Кофе и педали',
    about:
      'Городские покатушки от кофейни до кофейни. Подойдёт любой велосипед и любой уровень.',
    bike: { bikeType: 'road', brand: 'Trek', model: 'Domane AL 3' },
    monthKm: 400,
  },
];

const RIDERS: Person[] = [
  {
    key: 'rider.anna',
    firstName: 'Анна',
    lastName: 'Морозова',
    bike: { bikeType: 'road', brand: 'Giant', model: 'Contend AR' },
    monthKm: 350,
    bio: 'Катаю по утрам до работы.',
  },
  {
    key: 'rider.dmitry',
    firstName: 'Дмитрий',
    lastName: 'Орлов',
    bike: { bikeType: 'gravel', brand: 'Merida', model: 'Silex 400' },
    monthKm: 500,
  },
  {
    key: 'rider.kate',
    firstName: 'Екатерина',
    lastName: 'Волкова',
    bike: { bikeType: 'road', brand: 'Cannondale', model: 'Synapse' },
    monthKm: 700,
    bio: 'Готовлюсь к первому бревету.',
  },
  {
    key: 'rider.pavel',
    firstName: 'Павел',
    lastName: 'Никитин',
    bike: { bikeType: 'mtb', brand: 'Stark', model: 'Tactic' },
    monthKm: 200,
  },
  {
    key: 'rider.olga',
    firstName: 'Ольга',
    lastName: 'Белова',
    bike: { bikeType: 'gravel', brand: 'Format', model: '2322' },
    monthKm: 300,
  },
  {
    key: 'rider.sergey',
    firstName: 'Сергей',
    lastName: 'Ковалёв',
    bike: { bikeType: 'road', brand: 'Specialized', model: 'Tarmac SL7' },
    monthKm: 1100,
  },
  {
    key: 'rider.natalia',
    firstName: 'Наталья',
    lastName: 'Зайцева',
    bike: { bikeType: 'road', brand: 'Scott', model: 'Speedster' },
    monthKm: 250,
  },
  {
    key: 'rider.timur',
    firstName: 'Тимур',
    lastName: 'Галиев',
    bike: { bikeType: 'gravel', brand: 'Canyon', model: 'Grail' },
    monthKm: 650,
  },
];

type BicycleType = 'road' | 'gravel' | 'mtb' | 'any';
type RoutePointType =
  | 'start'
  | 'finish'
  | 'stop'
  | 'danger'
  | 'water'
  | 'food'
  | 'technical'
  | 'other';

interface RideSeed {
  organizer: string;
  title: string;
  description: string;
  bicycleType: BicycleType;
  // Days from today (Moscow) and local start time.
  day: number;
  time: [number, number];
  difficulty: number;
  paceKmh?: number;
  durationMinutes?: number;
  participantLimit?: number;
  priceRub?: number;
  waypoints: LatLng[];
  groups?: { name: string; paceKmh: number; description?: string }[];
  stops?: { name: string; description?: string; at: LatLng; minutes: number }[];
  points?: {
    type: RoutePointType;
    label: string;
    at: LatLng;
    description?: string;
  }[];
  riders?: string[];
  waitlist?: string[];
  updates?: string[];
  reviews?: { rider: string; rating: number; comment?: string }[];
  // Final state; `registration_open` when omitted.
  finalStatus?:
    | 'draft'
    | 'registration_open'
    | 'registration_closed'
    | 'finished'
    | 'cancelled';
}

const RIDES: RideSeed[] = [
  {
    organizer: 'org.coffee',
    title: 'Кофейный круг: центр и набережные',
    description:
      'Спокойный круг по центру: Патриаршие, Красная площадь, Парк Горького и Воробьёвы горы. Остановка на кофе в Парке Горького. Подойдёт для первого группового заезда.',
    bicycleType: 'any',
    day: 3,
    time: [8, 0],
    difficulty: 2,
    paceKmh: 20,
    durationMinutes: 120,
    participantLimit: 20,
    priceRub: 0,
    waypoints: [
      P.patriarchs,
      P.redSquare,
      P.gorkyPark,
      P.sparrowHills,
      P.luzhniki,
      P.krymskyBridge,
      P.patriarchs,
    ],
    groups: [
      { name: 'Спокойная', paceKmh: 20, description: 'С остановками на фото.' },
      { name: 'Бодрая', paceKmh: 25, description: 'Без долгих пауз.' },
    ],
    stops: [
      {
        name: 'Кофейня у Пионерского пруда',
        description: 'Кофе и круассаны, 20 минут.',
        at: P.gorkyPark,
        minutes: 20,
      },
    ],
    points: [
      { type: 'start', label: 'Патриаршие пруды', at: P.patriarchs },
      { type: 'food', label: 'Кофе в Парке Горького', at: P.gorkyPark },
      {
        type: 'danger',
        label: 'Спуск с Воробьёвых гор',
        at: P.sparrowHills,
        description: 'Крутой спуск, держите дистанцию.',
      },
      { type: 'finish', label: 'Финиш у Патриарших', at: P.patriarchs },
    ],
    riders: [
      'rider.anna',
      'rider.natalia',
      'rider.pavel',
      'rider.olga',
      'rider.kate',
    ],
    updates: [
      'Сбор в 7:45 у памятника Крылову, старт ровно в 8:00. Возьмите свет — утром пасмурно.',
    ],
  },
  {
    organizer: 'org.gravel',
    title: 'Гравий: Серебряный бор — Строгино — Крылатское',
    description:
      'Грунтовые дорожки Серебряного бора, пойма в Строгино и холмы Крылатского. Шины от 35 мм, немного песка.',
    bicycleType: 'gravel',
    day: 5,
    time: [9, 0],
    difficulty: 3,
    paceKmh: 22,
    durationMinutes: 180,
    participantLimit: 15,
    waypoints: [
      P.mnevniki,
      P.serebryanyBor,
      P.strogino,
      P.krylatskoye,
      P.mnevniki,
    ],
    groups: [
      { name: 'Гравий-лайт', paceKmh: 18 },
      { name: 'Темповая', paceKmh: 24 },
    ],
    stops: [
      { name: 'Пляж в Серебряном бору', at: P.serebryanyBor, minutes: 15 },
    ],
    points: [
      { type: 'start', label: 'Хорошёво-Мнёвники', at: P.mnevniki },
      { type: 'water', label: 'Родник в Строгино', at: P.strogino },
      {
        type: 'technical',
        label: 'Подъём на Крылатские холмы',
        at: P.krylatskoye,
      },
      { type: 'finish', label: 'Финиш', at: P.mnevniki },
    ],
    riders: ['rider.dmitry', 'rider.olga', 'rider.timur', 'rider.pavel'],
  },
  {
    organizer: 'org.north',
    title: 'Шоссе: Москва — Лобня — Дмитров',
    description:
      'Темповой выезд на север по Дмитровскому направлению. Обратно — электричкой из Дмитрова. Обязательны шлем, запасная камера и задний фонарь.',
    bicycleType: 'road',
    day: 10,
    time: [7, 30],
    difficulty: 4,
    paceKmh: 30,
    durationMinutes: 180,
    participantLimit: 30,
    priceRub: 500,
    waypoints: [P.altufyevo, P.dolgoprudny, P.lobnya, P.iksha, P.dmitrov],
    groups: [
      { name: 'Группа 30', paceKmh: 30 },
      {
        name: 'Группа 32,5',
        paceKmh: 32.5,
        description: 'Для тех, кто держит колесо.',
      },
    ],
    stops: [
      {
        name: 'Заправка в Икше',
        description: 'Вода и батончики.',
        at: P.iksha,
        minutes: 10,
      },
    ],
    points: [
      { type: 'start', label: 'Алтуфьево', at: P.altufyevo },
      {
        type: 'danger',
        label: 'Переезд в Лобне',
        at: P.lobnya,
        description: 'Железнодорожный переезд, спешиться.',
      },
      { type: 'finish', label: 'Дмитровский кремль', at: P.dmitrov },
    ],
    riders: ['rider.sergey', 'rider.kate', 'rider.anna'],
    updates: [
      'Прогноз — встречный ветер 5 м/с, держимся плотнее. Ремнабор обязателен.',
    ],
  },
  {
    organizer: 'org.gravel',
    title: 'Утро на Лосином острове',
    description:
      'Короткий утренний круг по лесным дорожкам Лосиного острова. Мест мало — если всё занято, вставайте в лист ожидания.',
    bicycleType: 'gravel',
    day: 2,
    time: [7, 0],
    difficulty: 2,
    paceKmh: 18,
    durationMinutes: 90,
    participantLimit: 4,
    waypoints: [P.sokolniki, P.losinyBiostation, P.losinyNorth, P.sokolniki],
    points: [
      { type: 'start', label: 'Сокольники, главный вход', at: P.sokolniki },
      { type: 'water', label: 'Биостанция', at: P.losinyBiostation },
    ],
    riders: ['rider.dmitry', 'rider.timur', 'rider.olga', 'rider.natalia'],
    waitlist: ['rider.anna', 'rider.pavel'],
  },
  {
    organizer: 'org.coffee',
    title: 'Вечер в Коломенском и Царицыно',
    description:
      'Вечерний заезд по двум усадьбам юга Москвы. Регистрация закрыта — состав собран.',
    bicycleType: 'any',
    day: 1,
    time: [19, 0],
    difficulty: 1,
    paceKmh: 18,
    durationMinutes: 120,
    participantLimit: 10,
    waypoints: [P.kolomenskoye, P.tsaritsyno, P.kolomenskoye],
    stops: [
      { name: 'Кофе у Царицынского пруда', at: P.tsaritsyno, minutes: 20 },
    ],
    points: [
      {
        type: 'start',
        label: 'Коломенское, Вознесенские ворота',
        at: P.kolomenskoye,
      },
      { type: 'food', label: 'Царицыно', at: P.tsaritsyno },
    ],
    riders: ['rider.anna', 'rider.kate', 'rider.olga', 'rider.natalia'],
    finalStatus: 'registration_closed',
  },
  {
    organizer: 'org.north',
    title: 'Вечерние Воробьёвы горы',
    description: 'Интервалы на подъёме Воробьёвых гор и круг по набережным.',
    bicycleType: 'road',
    day: -7,
    time: [19, 30],
    difficulty: 3,
    paceKmh: 26,
    durationMinutes: 90,
    participantLimit: 20,
    waypoints: [
      P.luzhniki,
      P.sparrowHills,
      P.neskuchny,
      P.krymskyBridge,
      P.luzhniki,
    ],
    riders: [
      'rider.sergey',
      'rider.kate',
      'rider.anna',
      'rider.timur',
      'rider.natalia',
    ],
    reviews: [
      {
        rider: 'rider.sergey',
        rating: 5,
        comment: 'Отличная тренировка, чёткая организация.',
      },
      {
        rider: 'rider.kate',
        rating: 5,
        comment:
          'Спасибо за интервалы, завтра болят ноги — значит, было хорошо!',
      },
      {
        rider: 'rider.anna',
        rating: 4,
        comment: 'Темп был высоковат для меня, но группа подождала.',
      },
      { rider: 'rider.timur', rating: 4 },
    ],
    finalStatus: 'finished',
  },
  {
    organizer: 'org.gravel',
    title: 'Гравий: Одинцово — Звенигород',
    description:
      'Грунтовки и лесные дороги на запад, финиш у Саввино-Сторожевского монастыря.',
    bicycleType: 'gravel',
    day: -14,
    time: [9, 0],
    difficulty: 4,
    paceKmh: 21,
    durationMinutes: 240,
    participantLimit: 12,
    waypoints: [P.odintsovo, P.zhavoronki, P.zvenigorod],
    points: [
      { type: 'start', label: 'Станция Одинцово', at: P.odintsovo },
      { type: 'finish', label: 'Звенигород', at: P.zvenigorod },
    ],
    riders: ['rider.dmitry', 'rider.olga', 'rider.timur'],
    reviews: [
      {
        rider: 'rider.dmitry',
        rating: 5,
        comment: 'Лучший гравий сезона, маршрут огонь.',
      },
      { rider: 'rider.olga', rating: 5, comment: 'Красиво и в меру сложно.' },
      {
        rider: 'rider.timur',
        rating: 4,
        comment: 'После Жаворонков много песка — берите шины пошире.',
      },
    ],
    finalStatus: 'finished',
  },
  {
    organizer: 'org.north',
    title: 'Черновик: осенний бревет до Звенигорода',
    description: 'Черновик: маршрут и группы ещё уточняются.',
    bicycleType: 'road',
    day: 21,
    time: [7, 0],
    difficulty: 5,
    paceKmh: 27.5,
    waypoints: [P.krylatskoye, P.odintsovo, P.zvenigorod],
    finalStatus: 'draft',
  },
  {
    organizer: 'org.coffee',
    title: 'Ночной круг по Садовому',
    description:
      'Ночной заезд по Садовому кольцу. Отменён из-за прогноза ливня.',
    bicycleType: 'any',
    day: 4,
    time: [23, 0],
    difficulty: 2,
    paceKmh: 20,
    durationMinutes: 90,
    participantLimit: 25,
    waypoints: [
      P.kurskaya,
      P.taganskaya,
      P.oktyabrskaya,
      P.smolenskaya,
      P.kurskaya,
    ],
    riders: ['rider.pavel', 'rider.natalia'],
    updates: [
      'Заезд отменён: обещают грозу с ливнем. Перенесём на следующую неделю.',
    ],
    finalStatus: 'cancelled',
  },
];

// Moscow has no DST: local = UTC+3.
function moscowStart(day: number, [hours, minutes]: [number, number]): string {
  const moscowNow = new Date(Date.now() + 3 * 3600_000);
  return new Date(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate() + day,
      hours - 3,
      minutes,
    ),
  ).toISOString();
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function reset(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      const pattern = `%@${DEMO_DOMAIN}`;
      await tx`DELETE FROM rides WHERE organizer_id IN (
        SELECT o.id FROM organizer_profiles o JOIN users u ON u.id = o.user_id
        WHERE u.email LIKE ${pattern})`;
      const deleted = await tx`DELETE FROM users WHERE email LIKE ${pattern}`;
      console.log(`reset: removed ${deleted.count} demo accounts`);
    });
  } finally {
    await sql.end();
  }
}

class RouteBuilderUnavailable extends Error {}

async function seedRide(
  seed: RideSeed,
  organizers: Map<string, Account>,
  riders: Map<string, Account>,
): Promise<void> {
  const organizer = organizers.get(seed.organizer)!;
  const session = organizer.session;
  const rider = (key: string) => riders.get(key)!;

  const { data: created } = await api<{ ride: { id: string } }>(
    'POST',
    '/v1/rides',
    {
      session,
      body: {
        title: seed.title,
        bicycleType: seed.bicycleType,
        startsAt: moscowStart(seed.day, seed.time),
        startTimezone: TIMEZONE,
      },
    },
  );
  const id = created.ride.id;
  const start = seed.waypoints[0]!;
  await api('PATCH', `/v1/rides/${id}`, {
    session,
    body: {
      description: seed.description,
      difficulty: seed.difficulty,
      paceKmh: seed.paceKmh ?? null,
      durationMinutes: seed.durationMinutes ?? null,
      participantLimit: seed.participantLimit ?? null,
      priceRub: seed.priceRub ?? null,
      startLat: start.lat,
      startLng: start.lng,
    },
  });

  try {
    if (!SKIP_ROUTES)
      await api('POST', `/v1/rides/${id}/route/build`, {
        session,
        body: { points: seed.waypoints },
      });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === 'route_builder_unavailable'
    ) {
      throw new RouteBuilderUnavailable(error.message);
    }
    throw error;
  }

  const groupIds: string[] = [];
  for (const group of seed.groups ?? []) {
    const { data } = await api<{ group: { id: string } }>(
      'POST',
      `/v1/rides/${id}/groups`,
      {
        session,
        body: group,
      },
    );
    groupIds.push(data.group.id);
  }
  for (const stop of seed.stops ?? []) {
    await api('POST', `/v1/rides/${id}/stops`, {
      session,
      body: {
        name: stop.name,
        description: stop.description ?? null,
        lat: stop.at.lat,
        lng: stop.at.lng,
        durationMinutes: stop.minutes,
      },
    });
  }
  for (const point of seed.points ?? []) {
    await api('POST', `/v1/rides/${id}/route-points`, {
      session,
      body: {
        type: point.type,
        label: point.label,
        description: point.description ?? null,
        lat: point.at.lat,
        lng: point.at.lng,
      },
    });
  }

  const status = seed.finalStatus ?? 'registration_open';
  if (status === 'draft') {
    console.log(`  ✓ ${seed.title} — draft`);
    return;
  }
  await api('POST', `/v1/rides/${id}/publish`, { session });
  await api('POST', `/v1/rides/${id}/open-registration`, { session });

  const groupFor = (index: number) =>
    groupIds.length ? { groupId: groupIds[index % groupIds.length] } : {};
  for (const [index, key] of (seed.riders ?? []).entries()) {
    await api('POST', `/v1/rides/${id}/register`, {
      session: rider(key).session,
      body: groupFor(index),
    });
  }
  for (const [index, key] of (seed.waitlist ?? []).entries()) {
    await api('POST', `/v1/rides/${id}/waitlist`, {
      session: rider(key).session,
      body: groupFor(index),
    });
  }
  for (const message of seed.updates ?? []) {
    await api('POST', `/v1/rides/${id}/updates`, {
      session,
      body: { message },
    });
  }

  if (status === 'cancelled') {
    await api('POST', `/v1/rides/${id}/cancel`, { session });
  }
  if (status === 'registration_closed' || status === 'finished') {
    await api('POST', `/v1/rides/${id}/close-registration`, { session });
  }
  if (status === 'finished') {
    await api('POST', `/v1/rides/${id}/start`, { session });
    await api('POST', `/v1/rides/${id}/finish`, { session });
    for (const review of seed.reviews ?? []) {
      await api('POST', `/v1/rides/${id}/reviews`, {
        session: rider(review.rider).session,
        body: { rating: review.rating, comment: review.comment ?? null },
      });
    }
  }
  console.log(`  ✓ ${seed.title} — ${status}`);
}

async function main(): Promise<void> {
  const databaseUrl = assertLocal();
  await api('GET', '/health').catch(() => {
    throw new Error(
      `API is not running at ${API_URL} — start it with pnpm dev.`,
    );
  });

  await reset(databaseUrl);

  console.log('accounts:');
  const organizers = new Map<string, Account>();
  for (const person of ORGANIZERS) {
    const account = await createAccount(person);
    await api('POST', '/v1/organizers/me', {
      session: account.session,
      body: { name: person.profile, description: person.about },
    });
    organizers.set(person.key, account);
    console.log(`  ✓ ${person.key}@${DEMO_DOMAIN} — ${person.profile}`);
  }
  const riders = new Map<string, Account>();
  for (const person of RIDERS) {
    riders.set(person.key, await createAccount(person));
    console.log(`  ✓ ${person.key}@${DEMO_DOMAIN}`);
  }

  console.log('rides:');
  for (const seed of RIDES) {
    await seedRide(seed, organizers, riders);
  }
  console.log(`done. Password for every demo account: ${DEMO_PASSWORD}`);
}

main().catch((error: unknown) => {
  if (error instanceof RouteBuilderUnavailable) {
    console.error(
      [
        '',
        'The route builder could not reach 2GIS (route_builder_unavailable).',
        'Routes are built through the app itself, so the API needs 2GIS:',
        '  • MAPS_2GIS_API_KEY must be set in .env, and',
        '  • *.api.2gis.com must be reachable from this machine — through a VPN',
        '    it usually is not (KI-056): turn it off or split-tunnel *.2gis.com.',
        'Demo accounts are already created; re-run pnpm seed:demo — it resets first.',
      ].join('\n'),
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exit(1);
});
