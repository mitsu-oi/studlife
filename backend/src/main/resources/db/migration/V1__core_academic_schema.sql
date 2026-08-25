-- =============================================================
-- V1 — академічна структура (схема Даші, university_game_schema.sql)
-- Університети → факультети → кафедри → програми → групи,
-- плюс гуртожитки, студенти й каркас рейтингу.
-- Потрібна для Фази 2 (вибір універу/общаги при створенні персонажа).
-- =============================================================

CREATE SCHEMA IF NOT EXISTS core;    -- навчальна структура
CREATE SCHEMA IF NOT EXISTS rating;  -- рейтингова система (окремо)

-- ---------- Довідник спеціальностей (перелік МОН, спільний для всіх вишів)
CREATE TABLE core.specialties (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code  TEXT NOT NULL UNIQUE,   -- напр. '121'
    name  TEXT NOT NULL           -- напр. 'Інженерія програмного забезпечення'
);

-- ---------- Університет
CREATE TABLE core.universities (
    id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  TEXT NOT NULL
);

-- ---------- Факультет / ННІ
CREATE TABLE core.faculties (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id  BIGINT NOT NULL REFERENCES core.universities(id) ON DELETE CASCADE,
    name           TEXT NOT NULL
);

-- ---------- Кафедра
CREATE TABLE core.departments (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    faculty_id  BIGINT NOT NULL REFERENCES core.faculties(id) ON DELETE CASCADE,
    name        TEXT NOT NULL
);

-- ---------- Освітня програма: кафедра (випускова) + спеціальність
-- Точка розширення: сюди пізніше чіпляються дисципліни навчального плану,
-- а від них — оцінки та відвідуваність.
CREATE TABLE core.educational_programs (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    department_id  BIGINT NOT NULL REFERENCES core.departments(id) ON DELETE CASCADE,
    specialty_id   BIGINT NOT NULL REFERENCES core.specialties(id) ON DELETE RESTRICT,
    name           TEXT NOT NULL,
    UNIQUE (department_id, specialty_id, name)
);

-- ---------- Академічна група
CREATE TABLE core.study_groups (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    educational_program_id  BIGINT NOT NULL REFERENCES core.educational_programs(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL
);

-- ---------- Гуртожиток
CREATE TABLE core.dormitories (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    university_id  BIGINT NOT NULL REFERENCES core.universities(id) ON DELETE CASCADE,
    name           TEXT NOT NULL
);

-- ---------- Студент (ігровий персонаж)
CREATE TABLE core.students (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    study_group_id  BIGINT NOT NULL REFERENCES core.study_groups(id) ON DELETE RESTRICT,
    dormitory_id    BIGINT REFERENCES core.dormitories(id) ON DELETE SET NULL,  -- nullable: не всі в гуртожитку
    full_name       TEXT NOT NULL
);

-- Індекси на FK (Postgres не створює їх автоматично)
CREATE INDEX idx_faculties_university          ON core.faculties(university_id);
CREATE INDEX idx_departments_faculty           ON core.departments(faculty_id);
CREATE INDEX idx_programs_department           ON core.educational_programs(department_id);
CREATE INDEX idx_programs_specialty            ON core.educational_programs(specialty_id);
CREATE INDEX idx_groups_program                ON core.study_groups(educational_program_id);
CREATE INDEX idx_dormitories_university        ON core.dormitories(university_id);
CREATE INDEX idx_students_group                ON core.students(study_group_id);
CREATE INDEX idx_students_dormitory            ON core.students(dormitory_id);

-- =============================================================
-- Рейтингова система — каркас в окремій схемі.
-- Фактори рейтингу (універ, кафедра, спеціальність, гуртожиток)
-- обчислюються з core-таблиць; тут зберігається лише результат.
-- =============================================================
CREATE TABLE rating.student_ratings (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id  BIGINT NOT NULL UNIQUE REFERENCES core.students(id) ON DELETE CASCADE
    -- пізніше: score, окремі складові, історія змін тощо
);

-- =============================================================
-- Майбутні розширення (не створюємо зараз, лише орієнтир):
--   core.disciplines        (educational_program_id FK)  -- дисципліни
--   core.teachers           (department_id FK)           -- викладачі
--   core.grades             (student_id, discipline_id)  -- оцінки
--   core.attendance         (student_id, discipline_id)  -- відвідуваність
--   game.events             (student_id FK)              -- події для офлайн-режиму (webhook)
-- =============================================================
