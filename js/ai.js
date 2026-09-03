// ============================================
// ai.js — ШІ-картки: зв'язок гри з «поштовою скринькою» (server/worker.js)
//
// ЯК ЦЕ ПРАЦЮЄ (головна ідея — гравець НІКОЛИ не чекає):
// Картку в ШІ просимо ЗАЗДАЛЕГІДЬ, у фоні, поки гравець читає попередню.
// Готова картка лежить «у запасі» і показується миттєво. Якщо запасу нема
// (нема інтернету, скінчився ліміт, ШІ забарився) — гра мовчки бере
// звичайну картку з data/events.js, і гравець нічого не помічає.
//
// ЗАЛІЗНЕ ПРАВИЛО: гра НІКОЛИ не ламається і не гальмує через ШІ.
// Будь-яка помилка тут = просто «сьогодні картки писав не ШІ».
//
// Тест: index.html#ai — попросити ШІ-картку одразу і показати її.
// ============================================

// ---------- НАЛАШТУВАННЯ (пісочниця Даші) ----------

// Адреса твоєї поштової скриньки (Cloudflare). Якщо переназвеш воркер —
// заміни рядок тут.
const AI_ENDPOINT = 'https://stud-life.batynchukdaryna.workers.dev/';

// Вимикач: постав false — гра гратиме тільки на своїх картках (data/events.js).
const AI_ENABLED = true;

// Яку частину карток пише ШІ (0.8 = приблизно 8 з 10).
// Решта — рукописні: вони кістяк гри, найкращі й перевірені, і саме вони
// рятують, коли ШІ недоступний.
//
// ⚠️ Ставити 1.0 не варто: тоді при вимкненому інтернеті чи вичерпаному
// ліміті гра різко зміниться на очах — а так рукописні картки трапляються
// весь час, і перехід непомітний.
const AI_SHARE = 0.8;

// Скільки останніх тем і виборів пам'ятаємо і надсилаємо скриньці.
// Більше — краща зв'язність, але довший запит.
const AI_MEMORY = 5;

// Скільки чекати на відповідь, поки не махнути рукою (мс).
const AI_TIMEOUT_MS = 30000;

// ---------- ПАМ'ЯТЬ: теми і вибори (живе у flags → зберігається у сейві) ----------

function aiMemory() {
  if (!gameState.flags.ai) gameState.flags.ai = { topics: [], choices: [] };
  const m = gameState.flags.ai;
  if (!Array.isArray(m.topics)) m.topics = [];
  if (!Array.isArray(m.choices)) m.choices = [];
  return m;
}

// Запам'ятати, ЩО гравець обрав — щоб наступні картки це враховували
// (і щоб інколи траплялось продовження: промок під дощем → речі мокрі).
function aiNoteChoice(card, choice) {
  if (!card || !choice) return;
  const m = aiMemory();
  m.choices.unshift({
    situation: String(card.text || '').slice(0, 120),
    chose: String(choice.label || '').slice(0, 80),
  });
  m.choices = m.choices.slice(0, AI_MEMORY);
}

// Запам'ятати тему показаної ШІ-картки — щоб теми не повторювались
function aiNoteTopic(topic) {
  if (!topic) return;
  const m = aiMemory();
  m.topics.unshift(topic);
  m.topics = m.topics.slice(0, AI_MEMORY);
}

// ---------- ЗАПАС ГОТОВИХ КАРТОК ----------

const aiState = {
  queue: [],        // готові картки, які чекають свого моменту
  pending: null,    // замовлення, яке зараз у дорозі (щоб не замовити двічі)
  failures: 0,      // скільки разів поспіль не вийшло
  received: 0,      // скільки ШІ-карток прийшло за сесію
  lastError: null,  // що саме пішло не так минулого разу
  limitReached: false, // денний ліміт вичерпано (429 від Google)
};

// Після 3 невдач поспіль перестаємо смикати скриньку до кінця сесії:
// найпевніше нема інтернету або скінчився денний ліміт.
const AI_MAX_FAILURES = 3;

function aiAvailable() {
  return AI_ENABLED && !aiState.limitReached && aiState.failures < AI_MAX_FAILURES;
}

// Стан ШІ людською мовою — показується в чит-панелі (клавіша D).
// Гравець цього не бачить: для нього гра просто грає далі на своїх картках.
function aiStatusText() {
  if (!AI_ENABLED) return '⚫ вимкнено (AI_ENABLED = false)';
  if (aiState.limitReached) return `🔴 ${aiState.lastError}`;
  if (aiState.failures >= AI_MAX_FAILURES) {
    return `🔴 вимкнувся після ${AI_MAX_FAILURES} невдач: ${aiState.lastError || '—'}`;
  }
  const queue = aiState.queue.length ? ` · у запасі ${aiState.queue.length}` : '';
  const wait = aiState.pending ? ' · чекаю відповідь…' : '';
  const warn = aiState.lastError ? ` · остання помилка: ${aiState.lastError}` : '';
  return `🟢 працює · отримано ${aiState.received}${queue}${wait}${warn}`;
}

// Попросити картку у скриньки. Нікого не блокує: працює у фоні,
// а як прийде — просто ляже в запас.
//
// Якщо замовлення вже в дорозі — повертаємо ЙОГО ж (а не пусту обіцянку),
// щоб той, хто вирішить дочекатись, справді дочекався картки.
// Для якої фази замовляти. Картку просимо ЗАВЧАСНО, тому цікавить не поточна
// фаза, а НАСТУПНА — саме там картка знадобиться. Після ночі — ранок нового дня.
function aiNextPhase() {
  const order = ['morning', 'day', 'evening', 'night'];
  const i = order.indexOf(gameState.phase);
  const next = order[(i + 1) % order.length];
  const day = next === 'morning' ? gameState.day + 1 : gameState.day;
  return { phase: next, day };
}

function aiPrefetch() {
  if (aiState.pending) return aiState.pending;
  if (!aiAvailable() || aiState.queue.length > 0) return Promise.resolve();
  aiState.pending = aiFetchCard().finally(() => { aiState.pending = null; });
  return aiState.pending;
}

async function aiFetchCard() {
  const m = aiMemory();
  const { phase, day } = aiNextPhase();

  // ніч — карток нема; ранок вихідного лишаємо рукописним (там свої дії,
  // не «пари/підробіток/спати», і баланс тонший)
  if (phase === 'night') return;
  if (phase === 'morning' && isWeekend(day)) return;

  const body = {
    day,
    phase,
    isWeekend: isWeekend(day),
    // де гравець сьогодні (university / work / home) — щоб ШІ не писав про
    // пари тому, хто їх проспав, і про корпуси у вихідний
    dayMode: typeof currentDayMode === 'function' ? currentDayMode() : 'home',
    // ЧИ ЗАХАРАЩЕНА КІМНАТА ЗАРАЗ.
    // Без цього ШІ писав про «завали одягу» при чистій кімнаті: він бачив
    // числа (🧠 70), але не знав, що безлад з'являється лише при ≤30.
    // Пороги ті самі, що в scene.js (renderMess).
    roomMessy: gameState.flags.roomCleanedDay !== gameState.day
               && (gameState.stats.mental <= 30 || gameState.stats.energy <= 30),
    stats: { ...gameState.stats },
    recentTopics: m.topics,
    recentChoices: m.choices,
  };

  // якщо ШІ забарився — перестаємо чекати, гра візьме свою картку
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const c = data && data.card;
    // ранкова картка мусить мати всі ТРИ дії (пари/підробіток/спати) —
    // інакше зламається баланс і статистика, тож таку відкидаємо
    const okShape = c && c.text && c.choices?.length >= (phase === 'morning' ? 3 : 2);
    if (okShape) {
      c.forPhase = phase; // для якої фази ця картка (щоб не показати не там)
      aiState.queue.push(c);
      aiState.failures = 0;
      aiState.received++;
      aiState.lastError = null;
    } else {
      aiState.failures++;
      const err = String((data && data.error) || 'відповідь не схожа на картку');
      // 429 від Google = «забагато запитів»: скінчився денний ліміт (1500/день)
      if (/\b429\b|quota|RESOURCE_EXHAUSTED/i.test(err)) {
        aiState.limitReached = true;
        aiState.lastError = 'вичерпано денний ліміт (1500 карток) — оновиться завтра';
      } else {
        aiState.lastError = err.slice(0, 160);
      }
      console.warn('ШІ-картка не вийшла:', err);
    }
  } catch (e) {
    aiState.failures++;
    aiState.lastError = e.name === 'AbortError'
      ? 'ШІ не встиг відповісти вчасно'
      : `нема зв\'язку зі скринькою (${e.message})`;
    console.warn('ШІ недоступний:', e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Взяти готову ШІ-картку із запасу (або null, якщо запас порожній).
// Одразу ж замовляє наступну — щоб до наступної фази вона вже була.
function aiTakeCard(phase) {
  if (!aiAvailable()) return null;
  // беремо тільки якщо картка справді для цієї фази (ранкову не покажемо ввечері)
  const ready = aiState.queue[0];
  const card = (ready && (!ready.forPhase || ready.forPhase === phase))
    ? aiState.queue.shift()
    : null;
  if (card) aiNoteTopic(card.topic);
  aiPrefetch(); // готуємо наступну заздалегідь (у фоні, нікого не чекаємо)
  return card;
}

// Чи брати цю фазу в ШІ (кидаємо монетку за AI_SHARE).
// Так рукописні й ШІ-картки перемішуються, і гра лишається твоєю.
function aiWantsTurn() {
  return aiAvailable() && Math.random() < AI_SHARE;
}
