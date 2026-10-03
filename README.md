<a id="top"></a>

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.svg">
  <img src="docs/assets/readme/hero-light.svg" width="100%" alt="Кофе-райд — групповые велозаезды с кофе">
</picture>

<img src="https://readme-typing-svg.demolab.com?font=Montserrat&weight=600&size=22&duration=3200&pause=900&color=82668C&center=true&vCenter=true&width=620&lines=%D0%9D%D0%B0%D0%B9%D0%B4%D0%B8%20%D0%B7%D0%B0%D0%B5%D0%B7%D0%B4%20%D0%BF%D0%BE%20%D1%82%D0%B5%D0%BC%D0%BF%D1%83%20%D0%B8%20%D0%BF%D0%BE%D0%BA%D1%80%D1%8B%D1%82%D0%B8%D1%8E;%D0%97%D0%B0%D0%BF%D0%B8%D1%88%D0%B8%D1%81%D1%8C%20%E2%80%94%20%D0%BC%D0%B5%D1%81%D1%82%D0%BE%20%D0%B7%D0%B0%20%D1%82%D0%BE%D0%B1%D0%BE%D0%B9;%D0%A1%D0%BE%D0%B1%D0%B5%D1%80%D0%B8%20%D0%B3%D1%80%D1%83%D0%BF%D0%BF%D1%83%20%D0%B8%20%D0%BF%D1%80%D0%BE%D0%BB%D0%BE%D0%B6%D0%B8%20%D0%BC%D0%B0%D1%80%D1%88%D1%80%D1%83%D1%82;%D0%9A%D0%BE%D1%84%D0%B5-%D1%81%D1%82%D0%BE%D0%BF%20%E2%80%94%20%D1%81%D0%B2%D1%8F%D1%82%D0%BE%D0%B5" alt="Найди заезд по темпу и покрытию · Запишись — место за тобой · Собери группу и проложи маршрут · Кофе-стоп — святое">

[![CI](https://github.com/ipoderator/coffee_ride_app/actions/workflows/ci.yml/badge.svg)](https://github.com/ipoderator/coffee_ride_app/actions/workflows/ci.yml)
![Последний коммит](https://img.shields.io/github/last-commit/ipoderator/coffee_ride_app?style=flat-square&label=%D0%BF%D0%BE%D1%81%D0%BB%D0%B5%D0%B4%D0%BD%D0%B8%D0%B9%20%D0%BA%D0%BE%D0%BC%D0%BC%D0%B8%D1%82&labelColor=17141A&color=82668C)
![Node 24](https://img.shields.io/badge/node-24_LTS-82668C?style=flat-square&logo=nodedotjs&logoColor=white&labelColor=17141A)
![pnpm](https://img.shields.io/badge/pnpm-10-82668C?style=flat-square&logo=pnpm&logoColor=white&labelColor=17141A)

**[О проекте](#about)** ·
**[Возможности](#features)** ·
**[Скриншоты](#screens)** ·
**[Быстрый старт](#quick-start)** ·
**[Архитектура](#architecture)** ·
**[Claude Code](#claude-code)** ·
**[Документация](#docs)**

</div>

---

<a id="about"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/People/Person%20Biking.png" width="32" align="top" alt="🚴"> О проекте

**Кофе-райд** — российская платформа для групповых велозаездов. Организатор за несколько
минут собирает заезд: маршрут на карте 2ГИС, остановки, сервисы, требования и лимит
участников. Райдер находит заезд под свой темп и велосипед, записывается в один клик и
получает обновления до самого старта. А после финиша — оставляет отзыв ☕

> [!NOTE]
> Проект в активной разработке: MVP реализован целиком, впереди первый боевой деплой.
> Актуальный срез — в [`project-state.md`](.claude/context/project-state.md), история — в
> [`docs/changelog.md`](docs/changelog.md).

<a id="features"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Sparkles.png" width="32" align="top" alt="✨"> Возможности

<table>
<tr>
<th width="50%">🙋 Участнику</th>
<th width="50%">📣 Организатору</th>
</tr>
<tr valign="top">
<td>

- 🔎 Каталог заездов списком и **на карте**
- 🎛 Фильтры: велосипед, неделя, темп, сложность, бесплатные
- 🗺 Маршрут, профиль высот, остановки и сервисы
- ✅ Запись в один клик и **лист ожидания**, если мест нет
- 🔔 Обновления от организатора во входящих
- 🚲 Гараж: свои велосипеды
- ⭐ Отзывы после финиша

</td>
<td>

- 🏁 Создание заезда: черновик → публикация → старт → финиш
- 🧭 Конструктор маршрута по точкам или загрузка GPX
- ☕ Остановки, сервисы (кофе, механик, сопровождение…) и требования
- 👥 Группы по темпу внутри одного заезда
- 📋 Участники, лист ожидания, отметки финиша
- 📨 Рассылка обновлений всем записавшимся
- 📊 Панель с ближайшими заездами и записями по дням

</td>
</tr>
</table>

<a id="screens"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Mobile%20Phone.png" width="32" align="top" alt="📱"> Как это выглядит

<div align="center">
<img src="docs/assets/readme/discovery-dark.png" width="100%" alt="Каталог заездов, тёмная тема">
<sub>Каталог заездов — фильтры по велосипеду, темпу и сложности, список или карта</sub>
</div>

<details>
<summary><b>📸 Ещё экраны — карточка заезда, кабинет организатора, светлая тема</b></summary>
<br>

|                           Карточка заезда                            |                               Кабинет организатора                               |
| :------------------------------------------------------------------: | :------------------------------------------------------------------------------: |
| <img src="docs/assets/readme/ride-detail.png" alt="Страница заезда"> | <img src="docs/assets/readme/organizer-dashboard.png" alt="Панель организатора"> |

<div align="center">
<img src="docs/assets/readme/discovery-light.png" width="70%" alt="Каталог, светлая тема"><br>
<sub>Светлая тема. Скриншоты — эталоны визуальных тестов Playwright, данные тестовые.</sub>
</div>
</details>

### 🔄 Жизненный цикл заезда

```mermaid
stateDiagram-v2
    direction LR
    state "Черновик" as draft
    state "Опубликован" as published
    state "Запись открыта" as open
    state "Запись закрыта" as closed
    state "Стартовал" as started
    state "Финиш 🏁" as finished
    state "Отменён" as cancelled

    [*] --> draft
    draft --> published
    published --> open
    open --> closed
    closed --> started
    started --> finished
    published --> cancelled
    open --> cancelled
    closed --> cancelled
```

<a id="quick-start"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Rocket.png" width="32" align="top" alt="🚀"> Быстрый старт

> [!TIP]
> Нужны **Node 24** (`.nvmrc`), **pnpm 10** и **Docker** — он поднимает Postgres, Redis и
> S3-хранилище (SeaweedFS).

```bash
nvm use && corepack enable           # Node 24 + pnpm
pnpm install                         # заодно ставит pre-commit хук Husky
cp .env.example .env                 # локальные настройки
pnpm infra:up                        # Postgres, Redis, S3 в Docker
pnpm --filter db db:migrate          # миграции базы
pnpm dev                             # web → :3000, api → :4000
```

| Что                  | Где                          |
| -------------------- | ---------------------------- |
| 🌐 Приложение        | <http://localhost:3000>      |
| ⚙️ API               | <http://localhost:4000/v1>   |
| 📘 Swagger / OpenAPI | <http://localhost:4000/docs> |

<details>
<summary><b>🧪 Демо-данные: 3 организатора, 8 райдеров, 9 заездов во всех статусах</b></summary>
<br>

При запущенном `pnpm dev`:

```bash
pnpm seed:demo              # пересоздаёт демо-аккаунты и заезды через API
pnpm seed:demo --no-routes  # без маршрутов — если 2ГИС недоступен
```

| Роль         | Логин                                                           | Пароль                  |
| ------------ | --------------------------------------------------------------- | ----------------------- |
| Организаторы | `org.north@`, `org.gravel@`, `org.coffee@demo.coffeeride.local` | `demo-coffee-ride-2026` |
| Райдеры      | `rider.anna@demo.coffeeride.local` и ещё 7                      | `demo-coffee-ride-2026` |

Скрипт можно запускать сколько угодно раз — в том числе после прерванного запуска.
Завершённые заезды получают отметки финиша, «сошёл», неявку и отзывы.
</details>

<details>
<summary><b>🩺 Если что-то не работает</b></summary>
<br>

- **«Загрузка недоступна»** — не запущено S3-хранилище. Поднимите его вместе с
  инициализацией бакета: `docker compose up -d s3 s3-init`. Проверка: `GET /health` → `s3`.
- **Нет маршрутов на карте** — API должен достучаться до 2ГИС; ключи — в `.env`
  (`MAPS_2GIS_API_KEY`, `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`). Без ключа карта показывает
  заглушку, остальное работает.
- **`pnpm infra:down`** останавливает инфраструктуру.

</details>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Hammer%20and%20Wrench.png" width="32" align="top" alt="🛠"> Стек

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js_15-17141A?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-17141A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-17141A?style=for-the-badge&logo=typescript&logoColor=3178C6)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-17141A?style=for-the-badge&logo=tailwindcss&logoColor=06B6D4)
![Fastify](https://img.shields.io/badge/Fastify_5-17141A?style=for-the-badge&logo=fastify&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-17141A?style=for-the-badge&logo=zod&logoColor=3E67B1)
<br>
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17141A?style=for-the-badge&logo=postgresql&logoColor=4169E1)
![Drizzle](https://img.shields.io/badge/Drizzle-17141A?style=for-the-badge&logo=drizzle&logoColor=C5F74F)
![Redis](https://img.shields.io/badge/Redis-17141A?style=for-the-badge&logo=redis&logoColor=FF4438)
![2GIS](https://img.shields.io/badge/2%D0%93%D0%98%D0%A1-17141A?style=for-the-badge&logo=googlemaps&logoColor=19AA1E)
![Docker](https://img.shields.io/badge/Docker-17141A?style=for-the-badge&logo=docker&logoColor=2496ED)
<br>
![Turborepo](https://img.shields.io/badge/Turborepo-17141A?style=for-the-badge&logo=turborepo&logoColor=FF1E56)
![Vitest](https://img.shields.io/badge/Vitest-17141A?style=for-the-badge&logo=vitest&logoColor=6E9F18)
![Playwright](https://img.shields.io/badge/Playwright-17141A?style=for-the-badge&logo=googlechrome&logoColor=2EAD33)
![Storybook](https://img.shields.io/badge/Storybook-17141A?style=for-the-badge&logo=storybook&logoColor=FF4785)
![k6](https://img.shields.io/badge/k6-17141A?style=for-the-badge&logo=k6&logoColor=7D64FF)

</div>

<a id="architecture"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Building%20Construction.png" width="32" align="top" alt="🏗"> Архитектура

Модульный монолит в монорепозитории pnpm + Turborepo. Браузер ходит только в `web`,
а тот проксирует `/api/v1/*` в `api` — один origin, без CORS.

```mermaid
flowchart LR
    U([👤 Браузер]) --> W["🖥 apps/web<br/>Next.js 15"]
    W -- "/api/v1/*" --> A["⚙️ apps/api<br/>Fastify 5 · REST · OpenAPI"]
    A --> DB[("🐘 PostgreSQL<br/>packages/db")]
    A --> R[("⚡ Redis<br/>очереди · лимиты")]
    A --> S3[("🪣 S3<br/>обложки · GPX")]
    W & A --> MC["🧭 maps-core<br/>интерфейс карт"]
    MC -.-> M2["maps-2gis<br/>адаптер"] -.-> G{{"🗺 2ГИС"}}
```

<details>
<summary><b>📦 Что лежит в репозитории</b></summary>
<br>

```text
apps/
  web/            Next.js: каталог, страница заезда, кабинеты участника и организатора
  api/            Fastify: бизнес-правила, авторизация, REST /v1 + OpenAPI
packages/
  db/             Drizzle-схема, миграции, клиент, демо-сид
  types/          общие типы и контракты API
  ui/             дизайн-система: токены, компоненты, терминология
  maps-core/      провайдер-независимый интерфейс карт
  maps-2gis/      адаптер 2ГИС — единственный, кто знает про SDK
  resilience/     таймауты, ретраи, circuit breaker для внешних сервисов
  config/         общие настройки ESLint / TS / Vitest
deploy/ load/     прод-сборка (Caddy, smoke) и нагрузочные тесты k6
docs/             продукт, архитектура, API, БД, дизайн, ADR, задачи
.claude/          правила, скиллы, агенты и память для Claude Code
```

</details>

<details>
<summary><b>🧠 Ключевые решения</b></summary>
<br>

| Решение                                            | Зачем                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Модульный монолит** (ADR-008)                    | Изоляция отказов через таймауты и очереди, а не через микросервисы                 |
| **Кабинеты из feature-модулей** (ADR-009)          | Новая фича кабинета не ломает соседние                                             |
| **Авторизация по возможностям** (ADR-006, ADR-013) | Нет жёстких ролей: один человек — и организатор, и участник                        |
| **Сменный провайдер карт** (ADR-010)               | 2ГИС спрятан за `maps-core`, замена не трогает фичи                                |
| **Инварианты в базе**                              | Вместимость, дубли записи и лист ожидания защищены транзакциями и ограничениями БД |

Полный журнал — [`docs/decisions.md`](docs/decisions.md).
</details>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Test%20Tube.png" width="32" align="top" alt="🧪"> Проверки качества

| Команда                                              | Что делает                                                |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | Линтер, типы, форматирование                              |
| `pnpm test`                                          | Unit- и интеграционные тесты (Vitest)                     |
| `pnpm test:coverage && pnpm coverage:check`          | Покрытие не ниже зафиксированного порога                  |
| `pnpm test:e2e`                                      | Сквозные сценарии и визуальные эталоны (Playwright)       |
| `pnpm --filter web test:storybook`                   | Компоненты в Storybook + проверка доступности WCAG 2.1 AA |
| `pnpm load:test` · `pnpm smoke:docker`               | Нагрузка k6 и smoke прод-образов                          |

Всё это (кроме нагрузки) гоняет CI на каждый PR и пуш в `main`.

<a id="claude-code"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Robot.png" width="32" align="top" alt="🤖"> Разработка с Claude Code

Репозиторий — долговременная память проекта: Claude Code читает контекст из файлов, а не
из истории чата, и после каждой задачи обновляет его.

```text
/status → /next → /plan → ✋ одобрение → /implement → /test → /review → исправления → ✅
```

<details>
<summary><b>🗃 Из чего состоит harness</b></summary>
<br>

| Где                                      | Что                                                               |
| ---------------------------------------- | ----------------------------------------------------------------- |
| [`.claude/CLAUDE.md`](.claude/CLAUDE.md) | Точка входа: миссия, стек, цикл разработки, выбор скиллов         |
| [`.claude/rules/`](.claude/rules/)       | Правила по областям: безопасность, БД, фронтенд, карты, тесты…    |
| [`.claude/skills/`](.claude/skills/)     | 17 процедур: миграция, новый эндпоинт, CI-триаж, закрытие задачи… |
| [`.claude/agents/`](.claude/agents/)     | Сабагенты: architect, backend, frontend, database, reviewer       |
| [`.claude/context/`](.claude/context/)   | Срез состояния, карта архитектуры, известные проблемы             |

</details>

<a id="docs"></a>

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Books.png" width="32" align="top" alt="📚"> Документация

|     | Документ                                                      | О чём                                              |
| :-: | ------------------------------------------------------------- | -------------------------------------------------- |
| 🎯  | [product.md](docs/product.md)                                 | Продукт, роли, поля заезда, MVP                    |
|  🏛  | [architecture.md](docs/architecture.md)                       | Стек, монорепо, инфраструктура                     |
| 🔌  | [api.md](docs/api.md)                                         | REST-контракт `/v1`, пагинация, ошибки RFC 9457    |
| 🐘  | [database.md](docs/database.md)                               | Модель данных и инварианты                         |
| 🔐  | [auth.md](docs/auth.md)                                       | Сессии, регистрация, сброс пароля                  |
|  🗺  | [maps.md](docs/maps.md)                                       | Карты и интеграция 2ГИС                            |
| 🎨  | [design.md](docs/design.md)                                   | Дизайн-система «Ночной старт», токены, типографика |
| 🚢  | [deployment.md](docs/deployment.md)                           | Прод-сборка, миграции, бэкапы                      |
| 🧾  | [decisions.md](docs/decisions.md)                             | Журнал архитектурных решений (ADR)                 |
| ✅  | [tasks.md](docs/tasks.md) · [changelog.md](docs/changelog.md) | Задачи и история изменений                         |

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Compass.png" width="32" align="top" alt="🧭"> Что дальше

- [ ] 🚢 Первый боевой деплой (Caddy + Docker Compose, KI-045)
- [ ] 🔑 Коммерческий ключ 2ГИС и тёмная подложка карты (KI-075, KI-057)
- [ ] 📬 Боевой провайдер уведомлений и S3 (ADR-007, ADR-005)
- [ ] 📍 Кластеризация маркеров на карте — когда заездов станет много

<div align="center">
<br>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/footer-dark.svg">
  <img src="docs/assets/readme/footer-light.svg" width="100%" alt="Увидимся на старте — кофе за нами">
</picture>

<sub>Сделано с ☕ и 🚲 · <a href="#top">↑ наверх</a></sub>
</div>
