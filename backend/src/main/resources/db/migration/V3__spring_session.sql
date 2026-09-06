-- =============================================================
-- V3 — таблиці для СЕСІЙ (Spring Session JDBC)
--
-- НАВІЩО ЦЕ ВЗАГАЛІ З'ЯВИЛОСЬ.
-- Сесія — це «номерок гардероба»: сервер видає його після входу й далі
-- за ним упізнає гравця. Спершу номерки жили в ПАМ'ЯТІ програми, і це
-- давало дві біди:
--   1. Render на безкоштовному тарифі засинає після 15 хв тиші. Прокинувся —
--      пам'ять чиста, усі номерки недійсні, усіх викинуло з акаунтів.
--   2. Номерок їздив у cookie. Гра на github.io, сервер на onrender.com —
--      для браузера це РІЗНІ сайти, тож cookie «стороння», а Safari на
--      iPhone такі блокує. На телефоні вхід не тримався взагалі.
-- Обидві біди лікує одне: сесії лежать у БАЗІ, а номерок їздить у
-- заголовку X-Auth-Token (див. SecurityConfig).
--
-- ЧОМУ ТАБЛИЦІ СТВОРЮЄМО САМІ, А НЕ ДАЄМО SPRING'У.
-- Spring уміє створювати їх сам, але в нас Boot 4 чомусь не вмикав
-- Spring Session автоматично (залежність була, таблиці не з'являлись,
-- заголовок не видавався). Тому вмикаємо явно через @EnableJdbcHttpSession,
-- а схему віддаємо Flyway — як і всю решту бази. Так стан бази завжди
-- описаний у міграціях, а не залежить від того, що вирішить бібліотека.
--
-- ⚠️ Текст нижче — ДОСЛІВНО з самої бібліотеки
-- (spring-session-jdbc-4.1.1.jar → schema-postgresql.sql). Не правити руками:
-- за цими назвами колонок Spring Session і шукає свої дані.
-- =============================================================

CREATE TABLE SPRING_SESSION (
	PRIMARY_ID CHAR(36) NOT NULL,
	SESSION_ID CHAR(36) NOT NULL,
	CREATION_TIME BIGINT NOT NULL,
	LAST_ACCESS_TIME BIGINT NOT NULL,
	MAX_INACTIVE_INTERVAL INT NOT NULL,
	EXPIRY_TIME BIGINT NOT NULL,
	PRINCIPAL_NAME VARCHAR(100),
	CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
	SESSION_PRIMARY_ID CHAR(36) NOT NULL,
	ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
	ATTRIBUTE_BYTES BYTEA NOT NULL,
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);
