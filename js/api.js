// ============================================
// api.js — зв'язок гри з власним сервером (Spring Boot на Render)
//
// ГОЛОВНА ІДЕЯ, і її варто зрозуміти до читання коду:
//
//   localStorage = РОБОЧА КОПІЯ    сервер = ГОЛОВНА КОПІЯ
//
// Гра як писала сейв у браузер, так і пише — миттєво, і це нікуди не діли.
// А на сервер той самий сейв додатково відлітає у ФОНІ. Гравець на це
// ніколи не чекає.
//
// ЧОМУ САМЕ ТАК, А НЕ «ПИШЕМО ПРЯМО НА СЕРВЕР»:
// saveGame() викликається з дев'яти місць по всій грі, і всюди — як
// звичайна миттєва дія: зберіг і пішов далі. А будь-яке звернення до
// сервера триває від десятої секунди до хвилини (на безкоштовному Render
// сервер ще й засинає). Якби saveGame() чекав на сервер, довелось би
// переписати пів гри на «зачекай, поки...» — і кожен вибір картки завмирав
// би на секунду. Тому: у браузер одразу, на сервер у фоні.
//
// НАСЛІДОК, ЯКИЙ ТРЕБА ЗНАТИ: якщо інтернету нема, гра працює ПОВНІСТЮ.
// Просто сейв лишається тільки в цьому браузері, поки зв'язок не з'явиться.
//
// ЗАЛІЗНЕ ПРАВИЛО (те саме, що в ai.js): гра НІКОЛИ не ламається через
// сервер. Будь-яка помилка тут = «граємо як раніше, без акаунта».
// ============================================

// ---------- НАЛАШТУВАННЯ (пісочниця Даші) ----------

// Адреса сервера.
//
// Вибирається САМА, залежно від того, звідки відкрита гра:
//   з інтернету (mitsu-oi.github.io) → живий сервер на Render
//   з http://127.0.0.1:...           → твій сервер на цьому ж комп'ютері
//
// НАВІЩО ТАК: живий сервер свідомо пускає ЛИШЕ адресу гри на GitHub Pages.
// Послабити це заради зручності не можна — тоді до нього могла б
// звертатись будь-яка сторінка від імені залогіненого гравця. Тому для
// розробки піднімаємо свій сервер, а не відчиняємо чужий.
//
// ⚠️ Якщо гра відкрита ПОДВІЙНИМ КЛІКОМ з диска (file://), вхід не
// працюватиме в жодному разі: у такої сторінки походження «null», і
// браузер не надішле cookie сесії навіть своєму серверу. Для перевірки
// входу гру треба ВІДДАВАТИ як сайт — див. PROJECT_HANDOFF.md,
// розділ «Локальна розробка з сервером».
const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? `http://${location.hostname}:8081`
  : 'https://studlife-backend.onrender.com';

// Вимикач: false — гра поводиться точно так, як до Етапу 18
// (сейв тільки в браузері, жодного акаунта). Зручно, коли лагодиш сервер.
const API_ENABLED = true;

// Скільки чекати відповіді, поки не махнути рукою (мс).
// 45 секунд — бо на безкоштовному Render сервер засинає після 15 хвилин
// тиші й перше звернення будить його майже хвилину.
const API_TIMEOUT_MS = 45000;

// Пауза перед відправкою сейва на сервер (мс).
// Навіщо: за один хід гра може викликати saveGame() кілька разів поспіль.
// Замість п'яти запитів чекаємо, поки метушня вщухне, і шлемо ОДИН —
// останній і найсвіжіший. Це зветься «дебаунс».
const API_PUSH_DELAY_MS = 1500;

// ---------- СТАН (для чит-панелі й діагностики) ----------

const apiState = {
  user: null,        // { id, username } або null, якщо не залогінений
  reachable: null,   // null — ще не питали, true/false — чи відповідає сервер
  pushTimer: null,   // таймер відкладеної відправки
  pushing: false,    // зараз уже щось відправляється
  pushAgain: false,  // поки відправляли, стан змінився — треба ще раз
  lastPushOk: null,  // чи вдалась остання відправка
  lastError: null,   // що саме пішло не так
};

function apiLoggedIn() {
  return !!(apiState.user && apiState.user.id);
}

// Рядок для чит-панелі (клавіша D) — людською мовою
function apiStatusText() {
  if (!API_ENABLED) return '⚫ вимкнено (API_ENABLED = false)';
  if (apiState.reachable === false) return `🔴 сервер недоступний${apiState.lastError ? ' · ' + apiState.lastError : ''}`;
  if (!apiLoggedIn()) return '🟡 працює, але ти не залогінена — сейв лише в цьому браузері';
  const sync = apiState.lastPushOk === false ? ' · остання відправка не вдалась' : '';
  return `🟢 ${apiState.user.username} · сейв їде на сервер${sync}`;
}

// ---------- НИЗ: один спільний спосіб звертатись до сервера ----------

/**
 * Обгортка над fetch. Робить три речі, які інакше довелось би повторювати
 * у кожній функції:
 *
 * 1. credentials: 'include' — НАЙВАЖЛИВІШЕ. Каже браузеру «надішли cookie
 *    з номерком сесії». Без цього рядка сервер на КОЖЕН запит відповідав би
 *    «а ти хто?», навіть одразу після успішного входу: браузер за
 *    замовчуванням не передає cookie на ЧУЖИЙ сайт, а github.io і
 *    onrender.com — різні сайти.
 * 2. таймаут — щоб гра не висіла вічно, якщо сервер мовчить.
 * 3. розбір відповіді — повертає { ok, status, data }, а не кидається
 *    винятками. Так у місцях виклику не треба скрізь писати try/catch.
 */
async function apiFetch(path, { method = 'GET', body = null } = {}) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(API_BASE + path, {
      method,
      signal: abort.signal,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    apiState.reachable = true;

    // 204 = «порожньо, але це не помилка» (напр. активної гри ще нема)
    if (res.status === 204) return { ok: true, status: 204, data: null };

    let data = null;
    try { data = await res.json(); } catch (e) { /* тіла нема — нормально */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    apiState.reachable = false;
    apiState.lastError = e.name === 'AbortError'
      ? 'сервер не відповів вчасно'
      : 'нема зв\'язку';
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Текст помилки від сервера (він шле {"status":..,"error":".."}). */
function apiErrorText(res, fallback) {
  return (res.data && res.data.error) || apiState.lastError || fallback;
}

// ---------- РОЗБУДИТИ СЕРВЕР ----------

/**
 * На безкоштовному Render сервер засинає після 15 хвилин тиші й
 * прокидається майже хвилину. Тому смикаємо його НАЙПЕРШЕ — ще поки
 * гравець читає екран входу і вписує пароль. Поки він друкує, сервер
 * встає, і сам вхід відбувається вже швидко.
 *
 * Відповіді не чекаємо і помилок не помічаємо: це не запит, а будильник.
 */
function apiWake() {
  if (!API_ENABLED) return;
  apiFetch('/api/health').catch(() => {});
}

// ---------- АКАУНТ ----------

/** Хто я? Повертає користувача або null. Не помилка, якщо не залогінений. */
async function apiMe() {
  const res = await apiFetch('/api/auth/me');
  apiState.user = res.ok && res.data && res.data.id ? res.data : null;
  return apiState.user;
}

/** Реєстрація. Повертає { ok } або { ok: false, error: 'текст' }. */
async function apiRegister(username, password) {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST', body: { username, password },
  });
  if (res.ok && res.data) {
    apiState.user = res.data;
    return { ok: true };
  }
  return { ok: false, error: apiErrorText(res, 'Не вдалося зареєструватись') };
}

/** Вхід. */
async function apiLogin(username, password) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST', body: { username, password },
  });
  if (res.ok && res.data) {
    apiState.user = res.data;
    return { ok: true };
  }
  // 401 від входу — це не «сервер зламався», а «логін або пароль не той»
  const msg = res.status === 401
    ? 'Логін або пароль не підходять'
    : apiErrorText(res, 'Не вдалося увійти');
  return { ok: false, error: msg };
}

/** Вихід. Сервер забуде номерок, ми забудемо користувача. */
async function apiLogout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  apiState.user = null;
}

// ---------- ПЕРЕКЛАД: gameState ↔ те, що розуміє сервер ----------

/**
 * Гра → сервер.
 *
 * ⚠️ Сервер зберігає шкали окремими колонками (money, energy…), а гнучкі
 * речі — у полях flags і counters, куди можна класти будь-що.
 *
 * Тому ім'я студента ми кладемо ВСЕРЕДИНУ flags: окремої колонки під нього
 * на сервері нема, а міняти базу заради одного рядка не варто. Так само
 * поїдуть і майбутні поля персонажа (універ, спеціальність, гуртожиток).
 *
 * dayLog не надсилаємо навмисно: це чернетка змін за поточний день для
 * нічного підсумку, вона й так обнуляється щоранку.
 */
function apiBuildSave() {
  const s = gameState.stats;
  return {
    day: gameState.day,
    phase: gameState.phase,
    money: Math.round(s.money),
    energy: Math.round(s.energy),
    mental: Math.round(s.mental),
    social: Math.round(s.social),
    study: Math.round(s.study),
    flags: { ...gameState.flags, student: gameState.student },
    counters: { ...gameState.counters },
  };
}

/**
 * Сервер → гра. Кладемо прийняте в localStorage, а далі спрацьовує
 * звичайний loadGame() — тобто решта гри навіть не знає, що сейв прилетів
 * з інтернету, а не лежав у браузері.
 */
function apiApplyServerSave(run) {
  if (!run) return false;
  const flags = { ...(run.flags || {}) };
  const student = flags.student || gameState.student;
  delete flags.student; // назад у своє поле, щоб не плутався серед прапорців

  const save = {
    student,
    day: run.day,
    phase: run.phase,
    stats: { ...run.stats },
    flags,
    dayLog: [],
    counters: { ...(run.counters || {}) },
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    return false; // приватне вікно / нема місця — не біда, зіграємо без сейва
  }
}

// ---------- ГРА НА СЕРВЕРІ ----------

/** Забрати з сервера незакінчену гру. null — немає такої. */
async function apiLoadRun() {
  if (!apiLoggedIn()) return null;
  const res = await apiFetch('/api/game/current');
  return res.ok ? res.data : null; // 204 → data === null
}

/** Почати нову гру на сервері (стару позначить завершеною). */
async function apiNewRun() {
  if (!apiLoggedIn()) return false;
  const res = await apiFetch('/api/game/new', { method: 'POST' });
  return res.ok;
}

/**
 * Відправити поточний стан. Викликається не напряму, а через
 * apiSchedulePush() — див. нижче.
 */
async function apiPushNow() {
  if (!apiLoggedIn()) return;
  apiState.pushing = true;
  try {
    let res = await apiFetch('/api/game/current', { method: 'PUT', body: apiBuildSave() });

    // 404 «активної гри немає» — гравець почав грати ще до входу в акаунт.
    // Тоді заводимо гру на сервері й повторюємо відправку один раз.
    if (!res.ok && res.status === 404) {
      if (await apiNewRun()) {
        res = await apiFetch('/api/game/current', { method: 'PUT', body: apiBuildSave() });
      }
    }

    apiState.lastPushOk = res.ok;
    if (!res.ok) {
      apiState.lastError = apiErrorText(res, `сервер відповів ${res.status}`);
      console.warn('Сейв не поїхав на сервер:', apiState.lastError);
    }
  } finally {
    apiState.pushing = false;
    // поки відправляли, гравець устиг щось зробити — шлемо ще раз
    if (apiState.pushAgain) {
      apiState.pushAgain = false;
      apiSchedulePush();
    }
  }
}

/**
 * ВІДКЛАСТИ ВІДПРАВКУ.
 *
 * Це те, що викликає saveGame() у state.js. Функція миттєва: вона нічого
 * не надсилає, а лише зводить таймер. Якщо за наступні півтори секунди
 * гру збережуть ще раз — таймер просто перезаводиться, і в підсумку
 * полетить ОДИН запит з найсвіжішим станом.
 */
function apiSchedulePush() {
  if (!API_ENABLED || !apiLoggedIn()) return;
  if (apiState.pushing) { apiState.pushAgain = true; return; }
  clearTimeout(apiState.pushTimer);
  apiState.pushTimer = setTimeout(() => { apiPushNow(); }, API_PUSH_DELAY_MS);
}

/**
 * Відправити негайно, не чекаючи таймера — коли гравець закриває вкладку.
 * Інакше останні півтори секунди гри могли б не доїхати.
 */
function apiPushImmediately() {
  if (!API_ENABLED || !apiLoggedIn()) return;
  clearTimeout(apiState.pushTimer);
  apiPushNow();
}

window.addEventListener('pagehide', apiPushImmediately);

// ---------- ЗАПУСК ГРИ ----------

/**
 * Що робити на старті. Викликається з main.js замість showStartScreen().
 *
 * Порядок такий:
 *   1. будимо сервер (не чекаючи)
 *   2. питаємо «хто я»
 *   3. якщо залогінені — забираємо сейв із сервера в браузер
 *   4. показуємо потрібний екран
 *
 * Якщо сервер недоступний на будь-якому кроці — просто показуємо
 * стартовий екран, і гра працює як раніше, на місцевому сейві.
 */
async function apiBoot() {
  if (!API_ENABLED) { showStartScreen(); return; }

  apiWake();

  try {
    await apiMe();
  } catch (e) {
    apiState.reachable = false;
  }

  if (apiState.reachable === false) {
    showToast('📴 Сервер недоступний — граємо офлайн');
    showStartScreen();
    return;
  }

  if (!apiLoggedIn()) { showAuthScreen(); return; }

  // залогінені: забираємо свій прогрес із сервера
  try {
    const run = await apiLoadRun();
    if (run) apiApplyServerSave(run);
  } catch (e) { /* не забрали — зіграємо на місцевому */ }

  showStartScreen();
}
