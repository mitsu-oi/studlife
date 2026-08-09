// ============================================
// state.js — стан гри + конфіг
// Структура дзеркалить майбутні таблиці БД (Фаза 3):
// student → core.students, stats → game.runs
// ============================================

const CONFIG = {
  // Внутрішня роздільність сцени = НАТИВНИЙ розмір фонового арту.
  // Жодних стискань/розтягувань — якість 1:1 як у джерела.
  // (Якщо перегенеруємо фон в іншому розмірі — міняємо тільки ці два числа.)
  SCENE_WIDTH: 1672,
  SCENE_HEIGHT: 941,
  TOTAL_DAYS: 30,
  START_STATS: {
    money: 1500, // 💰 гривні
    energy: 70,  // ⚡ 0–100
    mental: 70,  // 🧠 0–100
    social: 50,  // 👥 0–100
    study: 60,   // 📚 0–100
  },
};

// день 1 = понеділок
const WEEKDAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя'];
const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const PHASES = ['morning', 'day', 'evening', 'night'];
const PHASE_NAMES = {
  morning: '🌅 Ранок',
  day: '☀️ День',
  evening: '🌆 Вечір',
  night: '🌙 Ніч',
};

const gameState = {
  // → core.students (Фаза 3: заповниться на екрані створення персонажа)
  student: {
    fullName: 'Студент',
    universityId: 1,   // «Політех»
    dormitoryId: 1,    // «Одинадцятка»
    studyGroupId: null,
  },
  // → game.runs
  day: 1,
  phase: 'morning',
  stats: { ...CONFIG.START_STATS },
  flags: {},  // прапорці квестів/боргів/форс-мажорів
  dayLog: [], // зміни шкал за поточний день (для нічного підсумку)
  // лічильники для фінальної статистики місяця
  counters: { lectures: 0, work: 0, sleepIns: 0, boris: 0, borisKilled: 0, questsDone: 0, bought: 0 },
};

// ---------- Хелпери ----------

// 0..6 (Пн..Нд)
function getWeekdayIndex(day) {
  return (day - 1) % 7;
}

function getWeekdayName(day) {
  return WEEKDAYS[getWeekdayIndex(day)];
}

function isWeekend(day) {
  return getWeekdayIndex(day) >= 5;
}

// Змінити шкалу з обмеженням меж (гроші без верхньої межі, решта 0–100)
function changeStat(stat, delta) {
  const s = gameState.stats;
  if (!(stat in s)) return;
  s[stat] += delta;
  if (s[stat] < 0) s[stat] = 0;
  if (stat !== 'money' && s[stat] > 100) s[stat] = 100;
  gameState.dayLog.push({ stat, delta }); // для нічного підсумку
}

// ---------- Хід часу ----------

// Наступна фаза дня. Повертає 'phase' (перейшли) або 'night-end' (день скінчився).
function advancePhase() {
  const i = PHASES.indexOf(gameState.phase);
  if (i < PHASES.length - 1) {
    gameState.phase = PHASES[i + 1];
    return 'phase';
  }
  return 'night-end';
}

// Новий день: інкремент, бонус вихідного, автосейв.
// Повертає 'finale' після останнього дня, інакше 'newday'.
function startNewDay() {
  gameState.day++;
  gameState.phase = 'morning';
  gameState.dayLog = [];
  // вранці гравець ще в общазі — куди піде, вирішить ранкова картка
  // (див. DAY_MODE_BY_COUNT у js/events.js)
  gameState.flags.dayMode = 'home';
  if (gameState.day > CONFIG.TOTAL_DAYS) return 'finale';
  if (isWeekend(gameState.day)) changeStat('energy', +15); // виспався!
  if (gameState.stats.money <= 0) changeStat('mental', -5); // голодний студент — сумний студент
  // тривалі ефекти невирішених форс-мажорів (труба тече, інтернету нема…)
  if (typeof applyLastingForceMajeure === 'function') applyLastingForceMajeure();
  // 🖨️ мікробізнес: чи буде сьогодні замовлення або проблема з принтером
  if (typeof printerTick === 'function') printerTick();
  saveGame(); // автосейв щоранку
  return 'newday';
}

// Скинути все для нової гри
function newGame() {
  gameState.day = 1;
  gameState.phase = 'morning';
  gameState.stats = { ...CONFIG.START_STATS };
  gameState.flags = {};
  gameState.dayLog = [];
  gameState.counters = { lectures: 0, work: 0, sleepIns: 0, boris: 0, borisKilled: 0 };
  saveGame();
}

// ---------- Програш і кінцівки (Етап 5) ----------

const GAME_OVER_REASONS = {
  energy: {
    icon: '🏥', title: 'Госпіталізація',
    text: 'Організм оголосив страйк і викликав собі швидку сам. Лікар сказав «спати», деканат сказав «академ».',
  },
  mental: {
    icon: '🌀', title: 'Нервовий зрив',
    text: 'Остання крапля впала. Академвідпустка, чай з мелісою і жодних дедлайнів до вересня.',
  },
  study: {
    icon: '📉', title: 'Відрахування',
    text: 'Наказ уже висить на дошці оголошень. Комендант просить звільнити кімнату до п’ятниці.',
  },
};

// перевірка «чи гра скінчилась достроково»; null = все ще живий
function checkGameOver() {
  const s = gameState.stats;
  if (s.energy <= 0) return GAME_OVER_REASONS.energy;
  if (s.mental <= 0) return GAME_OVER_REASONS.mental;
  if (s.study <= 0) return GAME_OVER_REASONS.study;
  return null;
}

// підсумок 30 днів: стипендія, борг, фінальний рахунок і ключ кінцівки
function computeEnding() {
  const s = gameState.stats;
  const stipend = s.study >= 60 ? 2000 : 0;
  const debt = gameState.flags.loanTaken ? 600 : 0; // борг Ботанові з відсотком
  const finalMoney = s.money + stipend - debt;

  let key;
  if (s.energy >= 60 && s.mental >= 60 && s.social >= 60 && s.study >= 60 && finalMoney >= 1500) {
    key = 'champion';       // 🏆 Успішний у всьому
  } else if (finalMoney >= 2000 && (s.mental < 30 || s.energy < 30)) {
    key = 'burned';         // 💼 Вигорілий, але з грошима
  } else if (s.mental >= 60 && s.social >= 60 && finalMoney < 500) {
    key = 'happy_poor';     // ☮️ Щасливий, але бідний
  } else {
    key = 'classic';        // 🎓 Класичний студент
  }
  return { key, stipend, debt, finalMoney };
}

// ---------- Збереження ----------

const SAVE_KEY = 'studlife_save';

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
}

function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    Object.assign(gameState, JSON.parse(raw));
    // страховка: якщо сейв зі старої версії гри — доповнити відсутні поля
    if (!gameState.flags) gameState.flags = {};
    if (!gameState.dayLog) gameState.dayLog = [];
    if (!gameState.counters) gameState.counters = { lectures: 0, work: 0, sleepIns: 0, boris: 0, borisKilled: 0 };
    if (gameState.counters.borisKilled === undefined) gameState.counters.borisKilled = 0;
    if (gameState.counters.questsDone === undefined) gameState.counters.questsDone = 0;
    if (gameState.counters.bought === undefined) gameState.counters.bought = 0;
    return true;
  } catch (e) {
    // зіпсований сейв не має вбивати гру — просто починаємо заново
    return false;
  }
}
