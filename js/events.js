// ============================================
// events.js (ДВИГУН) — вибір і обробка карток подій
// Дані карток — у data/events.js. Показ — у ui.js (renderDecisionZone).
//
// Тест: index.html#card-<id> — форсувати конкретну картку при старті,
//       наприклад #card-canteen_cutlet
//       #card-<id>-<N> — форсувати картку і одразу обрати варіант N (з нуля),
//       наприклад #card-canteen_cutlet-0 — одразу «ризикнути котлетою»
// ============================================

// поточна картка фази і текст-наслідок після вибору
const cardState = {
  card: null,            // яка картка зараз на екрані (null = спокійна фаза)
  resolvedText: null,    // текст результату після вибору (null = ще не обрано)
  resolvedEffects: null, // які шкали і на скільки змінились (для плашок «+8 📚»)
};

const STAT_ICONS = { money: '💰', energy: '⚡', mental: '🧠', social: '👥', study: '📚' };

// історія показів: { card_id: день_показу } — живе у flags, тому зберігається
function cardHistory() {
  if (!gameState.flags.cardHistory) gameState.flags.cardHistory = {};
  return gameState.flags.cardHistory;
}

// ---------- відбір картки для фази ----------

function pickCardForPhase(phase) {
  if (phase === 'morning') return pickMorningCard();
  if (phase === 'night') return null;

  const hist = cardHistory();
  const pool = EVENTS_DATA.filter(card => {
    if (!card.phases.includes(phase)) return false;
    if (card.weekend === true && !isWeekend(gameState.day)) return false;
    if (card.weekend === false && isWeekend(gameState.day)) return false;
    if (!cardFitsPlace(card, phase)) return false; // не в універі — не про корпуси
    const lastShown = hist[card.id];
    if (card.oncePerGame && lastShown !== undefined) return false;
    if (lastShown !== undefined && gameState.day - lastShown < (card.cooldownDays || 3)) return false;
    if (!statsFit(card)) return false; // умови по шкалах (minStats / maxStats)
    // картка про куплений предмет — тільки якщо він справді куплений
    if (card.needsBought && !(gameState.flags.bought || {})[card.needsBought]) return false;
    return true;
  });
  if (pool.length === 0) return null; // спокійна фаза

  // зважений випадковий вибір (weight 0.5 = удвічі рідша за weight 1)
  const totalWeight = pool.reduce((sum, c) => sum + (c.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const card of pool) {
    r -= (card.weight || 1);
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

// ---------- ДЕ ГРАВЕЦЬ СЬОГОДНІ (залежить від ранкового вибору) ----------
// Пішов на пари → він в універі, і тільки там доречні картки про корпуси,
// «Годівничку» і викладачів. Поїхав на підробіток → він на роботі.
// Проспав → сидить в общазі. Інакше виходила б нісенітниця: проспав пари,
// а вдень «біжиш між корпусами».
//
// Режим визначаємо по лічильнику ранкового вибору (він є в усіх ранкових
// картках, і в рукописних, і в ШІ-шних):
const DAY_MODE_BY_COUNT = {
  lectures: 'university', // пішов на пари
  work: 'work',           // поїхав на підробіток
  sleepIns: 'home',       // відіспався, лишився в общазі
};

// Де гравець зараз. Ввечері всі однаково вдома — крім 8-ї пари, але вона
// сама вимагає 'university' (див. where у data/events.js).
function currentDayMode() {
  return gameState.flags.dayMode || 'home';
}

// Чи доречна картка там, де гравець зараз.
// Нема поля where — картка універсальна (побут, телефон, думки), доречна завжди.
function cardFitsPlace(card, phase) {
  if (!card.where) return true;
  if (isWeekend(gameState.day)) return true; // вихідні мають свій пул
  const mode = phase === 'evening' && !card.where.includes('university')
    ? 'home'      // ввечері всі вдома…
    : currentDayMode();
  return card.where.includes(mode);
}

// ---------- ранкова картка: щодня інша ----------
// Три дії (пари/підробіток/спати) лишаються ті самі — на них тримається
// баланс. Змінюються обставини: дощ, проспав, холодно… Вчорашню не повторюємо.
function pickMorningCard() {
  const all = isWeekend(gameState.day) ? MORNING_WEEKEND_CARDS : MORNING_WEEKDAY_CARDS;

  // Умови по шкалах — щоб не вийшло, як із карткою «на картці порожньо»
  // при 2200 ₴ на рахунку: minStats — «не менше», maxStats — «не більше».
  const fits = all.filter((c) => statsFit(c));

  const last = gameState.flags.lastMorningId;
  const fresh = fits.filter((c) => c.id !== last);
  const pool = fresh.length ? fresh : (fits.length ? fits : all);

  const card = pool[Math.floor(Math.random() * pool.length)];
  gameState.flags.lastMorningId = card.id;
  return card;
}

// чи підходить картка під поточні шкали (спільне для ранкових і звичайних)
function statsFit(card) {
  if (card.minStats) {
    for (const [stat, min] of Object.entries(card.minStats)) {
      if (gameState.stats[stat] < min) return false;
    }
  }
  if (card.maxStats) {
    for (const [stat, max] of Object.entries(card.maxStats)) {
      if (gameState.stats[stat] > max) return false;
    }
  }
  return true;
}

// ---------- ШІ-картка (js/ai.js): беремо з готового запасу ----------
// Ніколи не чекаємо на мережу: якщо запас порожній — повертаємо null,
// і гра спокійно бере свою рукописну картку.
function pickAiCard(phase) {
  if (typeof aiTakeCard !== 'function') return null; // ai.js не підключено
  if (phase === 'night') return null;
  if (phase === 'morning' && isWeekend(gameState.day)) return null; // ранок вихідного — свій
  if (!aiWantsTurn()) return null;                   // цю фазу веде рукописна
  return aiTakeCard(phase);
}

// ---------- вхід у фазу: витягнути картку і показати ----------

function enterPhase() {
  let card = null;

  // Заздалегідь замовляємо ШІ-картку у фоні (нікого не блокує): поки гравець
  // читає поточну, наступна вже готується. Так очікування не видно.
  if (typeof aiPrefetch === 'function') aiPrefetch();

  // тест-режим: #card-<id> форсує картку, #card-<id>-N ще й обирає варіант N
  let forcedChoice = null;
  const forced = location.hash.match(/^#(?:card|fm)-([a-z_]+?)(?:-(\d))?$/i);
  if (forced && !enterPhase._forcedUsed) {
    card = (typeof FORCE_MAJEURES !== 'undefined' && FORCE_MAJEURES.find(c => c.id === forced[1]))
        || EVENTS_DATA.find(c => c.id === forced[1]) || null;
    if (card) {
      enterPhase._forcedUsed = true;
      if (card.forceMajeure) triggerForceMajeure(card); // позначити активним
      if (forced[2] !== undefined) forcedChoice = parseInt(forced[2], 10);
    }
  }

  // Пріоритет: 1) нагадування про активний форс-мажор, 2) новий форс-мажор,
  // 3) «побалувати себе» (шопінг при достатку), 4) ШІ-картка з запасу,
  // 5) звичайна картка з data/events.js
  if (!card) {
    card = remindActiveForceMajeure(gameState.phase)
        || pickForceMajeure(gameState.phase)
        || pickShopping(gameState.phase)
        || pickAiCard(gameState.phase)
        || pickCardForPhase(gameState.phase);
  }

  // ШОПІНГ — окрема модалка (як форс-мажор, але приємна); вибір, що купити
  if (card && card.shopping) {
    gameState.flags.lastShopDay = gameState.day; // кулдаун від показу
    cardState.card = null;
    cardState.resolvedText = null;
    cardState.resolvedEffects = null;
    renderHUD();
    renderDecisionZone();
    if (typeof showShopping === 'function') showShopping();
    return;
  }

  // ФОРС-МАЖОР — окреме модальне вікно ПО ЦЕНТРУ (не в зоні рішень унизу).
  // Унизу лишаємо спокійну фазу — її однаково перекриває модалка.
  if (card && card.forceMajeure) {
    const st = fmState()[card.id];
    // нагадування = проблема триває з попереднього дня (не свіжий тригер)
    const isReminder = !!(st && st.active && st.since < gameState.day);
    if (st) st.remindedDay = gameState.day; // сьогодні вже показали
    cardState.card = null;
    cardState.resolvedText = null;
    cardState.resolvedEffects = null;
    renderHUD();
    renderDecisionZone();
    if (typeof showForceMajeure === 'function') {
      showForceMajeure(card, isReminder);
      if (forcedChoice !== null && card.choices[forcedChoice] && typeof onFMChoice === 'function') {
        onFMChoice(forcedChoice); // тест #fm-<id>-N
      }
    }
    return;
  }

  cardState.card = card;
  cardState.resolvedText = null;
  cardState.resolvedEffects = null;

  // запам'ятати день показу (для кулдауна); ранкові фіксовані — не потрібно.
  // ШІ-картки теж пропускаємо: вони щоразу нові, а їхні id лише роздули б сейв.
  if (card && !card.ai && !card.morning) {
    cardHistory()[card.id] = gameState.day;
  }

  renderHUD();
  renderDecisionZone();

  // вранці — тост-нагадування, якщо сусід уже готовий віддати нагороду (Етап 8)
  if (gameState.phase === 'morning' && typeof questReminders === 'function') {
    questReminders();
  }

  // тест-режим: одразу «натиснути» обраний варіант
  if (card && forcedChoice !== null && card.choices[forcedChoice]) {
    chooseOption(forcedChoice);
  }
}

// ---------- гравець натиснув варіант ----------

// applyChoice за індексом у card.choices (звичайні картки)
function applyChoice(card, index) {
  return applyChoiceObj(card, card.choices[index]);
}

// Застосувати КОНКРЕТНИЙ варіант (об'єкт) — щоб працювало і з додатковими
// варіантами форс-мажору (reminderExtra), яких нема в card.choices.
// Повертає { result, effects } або null, якщо вимога не виконана.
function applyChoiceObj(card, choice) {
  // страховка: вимога не виконана (кнопка і так заблокована в UI)
  if (choice.requires && gameState.stats[choice.requires.stat] < choice.requires.gte) return null;

  // звичайний або випадковий (roll) наслідок
  let effects = choice.effects;
  let result = choice.result;
  if (choice.roll) {
    let r = Math.random();
    let outcome = choice.roll[choice.roll.length - 1];
    for (const o of choice.roll) {
      if (r < o.p) { outcome = o; break; }
      r -= o.p;
    }
    effects = outcome.effects;
    result = outcome.result;
  }

  for (const [stat, delta] of Object.entries(effects || {})) changeStat(stat, delta);

  // прапорці (напр. loanTaken) і лічильники для фінальної статистики
  if (choice.setFlag) gameState.flags[choice.setFlag] = true;
  if (choice.count) gameState.counters[choice.count]++;

  // ранковий вибір задає, ДЕ гравець проведе день (універ / робота / общага)
  if (card.morning && choice.count && DAY_MODE_BY_COUNT[choice.count]) {
    gameState.flags.dayMode = DAY_MODE_BY_COUNT[choice.count];
  }

  // «прибрати кімнату» — мотлох зникає щонайменше до наступного дня,
  // навіть якщо ⚡/🧠 низькі (див. renderMess у scene.js)
  if (choice.cleanRoom) gameState.flags.roomCleanedDay = gameState.day;

  // запам'ятати вибір для ШІ: з цього він розуміє, який ти гравець,
  // і інколи робить картку-наслідок (js/ai.js)
  if (typeof aiNoteChoice === 'function') aiNoteChoice(card, choice);

  // форс-мажор: варіант з resolves — усуває проблему (слід і drain зникають)
  if (card.forceMajeure && choice.resolves) {
    const st = fmState()[card.id];
    if (st) st.active = false;
  }

  return { result: result || 'Зроблено.', effects: effects || {} };
}

// звичайна картка: застосувати вибір і показати наслідок у зоні рішень
function chooseOption(index) {
  const r = applyChoice(cardState.card, index);
  if (!r) return;
  cardState.resolvedText = r.result;
  cardState.resolvedEffects = r.effects;
  renderHUD();
  renderDecisionZone();
}

// ============================================
// Форс-мажори (Етап 9): тригер, тривалі ефекти
// Тест: index.html#fm-<id> (напр. #fm-pipe_burst), #fm-<id>-N — і одразу варіант N
// ============================================

// стан форс-мажорів у flags (зберігається): { <id>: {active, since, lastDay} }
function fmState() {
  if (!gameState.flags.fm) gameState.flags.fm = {};
  return gameState.flags.fm;
}
// журнал днів, коли траплявся будь-який форс-мажор (для обмежень частоти)
function fmLog() {
  if (!gameState.flags.fmLog) gameState.flags.fmLog = [];
  return gameState.flags.fmLog;
}

// позначити форс-мажор активним (слід з'являється, тривалий ефект тікає)
function triggerForceMajeure(fm) {
  const day = gameState.day;
  fmState()[fm.id] = { active: true, since: day, lastDay: day };
  if (!fmLog().includes(day)) fmLog().push(day);
  // емоційна реакція мешканців (characters.js) — щоб точно майнула навіть при
  // миттєвому вирішенні; поки FM активний, емоція триває сама
  if (fm.emotion && typeof noteForceMajeureReaction === 'function') {
    noteForceMajeureReaction(fm.emotion);
  }
}

// вибрати форс-мажор для фази (або null). Обмеження: не раніше minDay,
// ≤1 на день, ≤2 на тиждень; шанс росте при просілих шкалах (riskWhen).
const FM_MIN_GAP_DAYS = 2; // не частіше ніж раз на 2 дні

function pickForceMajeure(phase) {
  if (typeof FORCE_MAJEURES === 'undefined') return null;
  const day = gameState.day;
  const log = fmLog();
  if (log.some(d => day - d < FM_MIN_GAP_DAYS)) return null;  // мінімум 2 дні між
  if (log.filter(d => day - d < 7).length >= 2) return null;  // і ≤2 на тиждень

  const cands = FORCE_MAJEURES.filter(fm => {
    if (!fm.phases.includes(phase)) return false;
    if (day < (fm.minDay || 4)) return false;             // не в перші дні
    const st = fmState()[fm.id];
    if (st && st.active) return false;                    // вже триває
    if (st && day - st.lastDay < (fm.cooldownDays || 6)) return false;
    return true;
  });
  if (!cands.length) return null;

  // перемішати, щоб не завжди спрацьовував перший у списку
  for (let i = cands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cands[i], cands[j]] = [cands[j], cands[i]];
  }
  for (const fm of cands) {
    let chance = fm.baseChance;
    if (fm.riskWhen) {
      for (const [stat, thr] of Object.entries(fm.riskWhen)) {
        if (gameState.stats[stat] < thr) chance += fm.riskBonus || 0.15;
      }
    }
    if (Math.random() < chance) {
      triggerForceMajeure(fm);
      return fm;
    }
  }
  return null;
}

// ============================================
// Шопінг «побалувати себе» (ідея Даші): купівля предметів при достатку 💰
// ============================================

// куплені предмети живуть у flags (зберігаються): { <item_id>: true }
function boughtState() {
  if (!gameState.flags.bought) gameState.flags.bought = {};
  return gameState.flags.bought;
}

// чи показувати картку-шопінг: грошей досить, є що купити, кулдаун минув
function pickShopping(phase) {
  if (typeof SHOP_ITEMS === 'undefined') return null;
  if (phase !== 'day' && phase !== 'evening') return null;
  if (gameState.stats.money < SHOP_MONEY) return null;
  const last = gameState.flags.lastShopDay;
  if (last !== undefined && gameState.day - last < SHOP_COOLDOWN) return null;
  const b = boughtState();
  // є хоч один некуплений предмет, який гравцю по кишені?
  const affordable = SHOP_ITEMS.some(it => !b[it.id] && gameState.stats.money >= it.price);
  if (!affordable) return null;
  return { shopping: true, id: '__shop' };
}

// нагадування: активний невирішений форс-мажор, який сьогодні ще не показували
// і який гравець не «ігнорує до кінця». Нагадуємо раз на день (день/вечір).
function remindActiveForceMajeure(phase) {
  if (typeof FORCE_MAJEURES === 'undefined') return null;
  if (phase !== 'day' && phase !== 'evening') return null;
  const st = fmState();
  for (const fm of FORCE_MAJEURES) {
    const s = st[fm.id];
    if (s && s.active && !s.ignored && s.remindedDay !== gameState.day) return fm;
  }
  return null;
}

// щоранку: тривалі ефекти невирішених форс-мажорів (drain + нагадування-тост)
function applyLastingForceMajeure() {
  const st = fmState();
  for (const fm of (typeof FORCE_MAJEURES !== 'undefined' ? FORCE_MAJEURES : [])) {
    if (!fm.lasting || !st[fm.id] || !st[fm.id].active) continue;
    for (const [stat, delta] of Object.entries(fm.lasting.perDay || {})) changeStat(stat, delta);
    if (fm.lasting.toast && typeof showToast === 'function') showToast(fm.lasting.toast);
  }
}
