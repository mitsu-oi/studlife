-- =============================================================
-- V2 — акаунти гравців, збереження прогресу й облік звернень до ШІ
--
-- Саме цього бракувало, щоб закрити дірку з безпекою: коли стан гри
-- живе ТУТ, а не приходить від браузера, підсунути свій текст у промпт
-- більше нізвідки — сервер бере все зі своєї бази.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS app;   -- акаунти й службове
CREATE SCHEMA IF NOT EXISTS game;  -- ігровий прогрес

-- ---------- АКАУНТИ ----------
-- ⚠️ Пароль НІКОЛИ не зберігається як текст — тільки хеш (BCrypt).
-- Хеш не можна «розшифрувати» назад: при вході ми хешуємо введений
-- пароль і порівнюємо хеші. Навіть якщо базу вкрадуть, паролів там нема.
CREATE TABLE app.users (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username       TEXT        NOT NULL UNIQUE,
    password_hash  TEXT        NOT NULL,
    -- 'PLAYER' — звичайний гравець, 'ADMIN' — Даша (більший ліміт ШІ тощо)
    role           TEXT        NOT NULL DEFAULT 'PLAYER',
    -- заблокований користувач не може ні грати, ні смикати ШІ
    is_blocked     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ,

    CONSTRAINT users_username_len CHECK (char_length(username) BETWEEN 3 AND 32),
    CONSTRAINT users_role_valid   CHECK (role IN ('PLAYER', 'ADMIN'))
);

-- ---------- ПРОХОДЖЕННЯ (одна гра = один рядок) ----------
-- Дзеркалить gameState з js/state.js. Шкали — окремими колонками, бо за
-- ними буде рейтинг і статистика. Прапорці й лічильники — у JSONB:
-- це «вільна форма» всередині клітинки. Так зроблено навмисно, бо їх
-- багато й вони змінюються щотижня (квести, форс-мажори, покупки) —
-- інакше довелося б міняти таблицю після кожної нової механіки.
CREATE TABLE game.runs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    -- ігровий персонаж (Фаза 2: універ/спеціальність/гуртожиток)
    student_id  BIGINT      REFERENCES core.students(id) ON DELETE SET NULL,

    day         SMALLINT    NOT NULL DEFAULT 1,
    phase       TEXT        NOT NULL DEFAULT 'morning',

    money       INTEGER     NOT NULL DEFAULT 1500,
    energy      SMALLINT    NOT NULL DEFAULT 70,
    mental      SMALLINT    NOT NULL DEFAULT 70,
    social      SMALLINT    NOT NULL DEFAULT 50,
    study       SMALLINT    NOT NULL DEFAULT 60,

    flags       JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- квести, покупки, форс-мажори
    counters    JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- пар відвідано, Бориса прибито…

    -- ACTIVE — гра триває, FINISHED — дожив до 30-го дня, LOST — програв
    status      TEXT        NOT NULL DEFAULT 'ACTIVE',
    ending      TEXT,        -- яка кінцівка випала (champion/burned/…)
    final_score INTEGER,     -- підсумковий рахунок → у рейтинг

    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,

    CONSTRAINT runs_day_range   CHECK (day BETWEEN 1 AND 31),
    CONSTRAINT runs_phase_valid CHECK (phase IN ('morning', 'day', 'evening', 'night')),
    CONSTRAINT runs_status_valid CHECK (status IN ('ACTIVE', 'FINISHED', 'LOST')),
    -- шкали не можуть вилізти за межі навіть через помилку в коді
    CONSTRAINT runs_stats_range CHECK (
        energy BETWEEN 0 AND 100 AND mental BETWEEN 0 AND 100 AND
        social BETWEEN 0 AND 100 AND study  BETWEEN 0 AND 100 AND money >= 0
    )
);

-- у гравця може бути лише ОДНА активна гра
CREATE UNIQUE INDEX idx_runs_one_active
    ON game.runs(user_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_runs_user ON game.runs(user_id);

-- ---------- ІСТОРІЯ ВИБОРІВ ----------
-- Те, що зараз браузер надсилає скриньці сам (і чим можна зловживати).
-- Тепер це пише сервер, а для промпта бере звідси.
CREATE TABLE game.choices (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id     BIGINT      NOT NULL REFERENCES game.runs(id) ON DELETE CASCADE,
    day        SMALLINT    NOT NULL,
    phase      TEXT        NOT NULL,
    card_id    TEXT        NOT NULL,   -- id картки або 'ai_…' для згенерованої
    topic      TEXT,                   -- тема ШІ-картки (щоб не повторювались)
    situation  TEXT        NOT NULL,   -- текст ситуації
    chose      TEXT        NOT NULL,   -- що обрав гравець
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_choices_run ON game.choices(run_id, created_at DESC);

-- ---------- ОБЛІК ЗВЕРНЕНЬ ДО ШІ ----------
-- Ліміт рахується НА ЛЮДИНУ на добу. Зараз ліміт спільний, тому один
-- зловмисник з'їдає його для всіх — саме це й треба виправити.
CREATE TABLE game.ai_usage (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id  BIGINT   NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    usage_day DATE    NOT NULL DEFAULT CURRENT_DATE,
    used     INTEGER  NOT NULL DEFAULT 0,

    UNIQUE (user_id, usage_day)
);

-- ---------- РЕЙТИНГ ----------
-- Каркас rating.student_ratings з V1 лишається; додаємо те, чого бракувало:
-- сам бал і зв'язок із конкретним проходженням.
ALTER TABLE rating.student_ratings
    ADD COLUMN IF NOT EXISTS run_id     BIGINT REFERENCES game.runs(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS score      INTEGER,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
