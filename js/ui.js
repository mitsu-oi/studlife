// ============================================
// ui.js — HUD (день, день тижня, шкали)
// Картки, діалоги, екрани старту/фіналу — наступні етапи.
// ============================================

const STAT_META = [
  { key: 'money',  icon: '💰', name: 'Гроші' },
  { key: 'energy', icon: '⚡', name: 'Енергія' },
  { key: 'mental', icon: '🧠', name: 'Менталочка' },
  { key: 'social', icon: '👥', name: 'Соціалка' },
  { key: 'study',  icon: '📚', name: 'Навчання' },
];

// пороги з GDD: high ≥70, mid 30–69, low <30
function statLevel(value) {
  if (value >= 70) return 'high';
  if (value >= 30) return 'mid';
  return 'low';
}

function renderHUD() {
  const hud = document.getElementById('hud');
  const day = gameState.day;
  const weekendMark = isWeekend(day) ? ' <span class="weekend">(вихідний)</span>' : '';

  let html = `<span class="day-info">День ${day}/${CONFIG.TOTAL_DAYS} · ${getWeekdayName(day)}${weekendMark} · ${PHASE_NAMES[gameState.phase]}</span>`;

  for (const meta of STAT_META) {
    const value = gameState.stats[meta.key];
    if (meta.key === 'money') {
      // гроші — без смужки, просто сума в гривнях
      html += `<span class="stat" title="${meta.name}">${meta.icon} <span class="value">${value}₴</span></span>`;
    } else {
      const level = statLevel(value);
      html += `
        <span class="stat" title="${meta.name}">
          ${meta.icon}
          <span class="bar"><span class="fill ${level}" style="width:${value}%"></span></span>
          <span class="value">${value}</span>
        </span>`;
    }
  }

  hud.innerHTML = html;

  // разом зі шкалами оновлюємо й кнопку магазину: вона світиться,
  // коли грошей вистачає бодай на найдешевшу річ
  updateShopButton();
}

// ============================================
// Хід часу: кнопка «Далі», нічний підсумок,
// КАЛЕНДАРИК нового дня, заглушка фіналу
// ============================================

// тексти для фаз без подій
const PHASE_QUIET = {
  day: 'Спокійний день — нічого особливого не сталося. Рідкість для общаги.',
  evening: 'Тихий вечір. Навіть Борис сидить у себе.',
  night: 'Час спати — завтра новий день…',
};

// Зона рішень: показує картку з виборами / результат вибору / спокійну фазу
/**
 * 📱 ЧИ ЗАРАЗ ТЕЛЕФОН.
 *
 * Той самий поріг, що й у стилях (@media max-width: 760px) — щоб вигляд
 * і поведінка перемикались ОДНОЧАСНО. Якщо міняти, то в обох місцях.
 */
function isMobileLayout() {
  return window.matchMedia('(max-width: 760px)').matches;
}

/**
 * 📱 КАРТКА НА ВЕСЬ ЕКРАН (ідея Даші).
 *
 * На телефоні картка в панельці внизу нікуди не годиться: сцена й так
 * тісниться, а текст із кнопками з'їдають пів екрана. Тому там панель
 * стає ОДНІЄЮ кнопкою, а сама картка відкривається великим вікном —
 * так само, як уже працюють форс-мажори.
 *
 * Логіка вибору та сама (chooseOption), змінюється лише подача.
 */
function showCardModal() {
  const card = cardState.card;
  if (!card) return;

  const buttons = card.choices.map((choice, i) => {
    if (choice.requires && gameState.stats[choice.requires.stat] < choice.requires.gte) {
      const icon = STAT_ICONS[choice.requires.stat];
      return `<button class="btn locked-btn" disabled>${choice.label}
        <span class="lock-reason">потрібно ${icon} ≥ ${choice.requires.gte}</span></button>`;
    }
    return `<button class="btn" data-i="${i}">${choice.label}</button>`;
  }).join('');

  showOverlay(`
    <div class="window card-modal">
      <div class="card-modal-phase">${PHASE_NAMES[gameState.phase]} · День ${gameState.day}</div>
      <p class="fm-text">${card.text}</p>
      <div class="card-choices fm-choices">${buttons}</div>
    </div>`);

  document.querySelectorAll('#overlay .btn[data-i]').forEach(btn => {
    btn.onclick = () => {
      // вибір зроблено — закриваємо вікно, а наслідок показуємо на місці
      // (внизу): він короткий, і туди ж лягає кнопка «Далі»
      hideOverlay();
      chooseOption(Number(btn.dataset.i));
    };
  });
}

function renderDecisionZone() {
  const zone = document.getElementById('decision-zone');
  const card = cardState.card;
  const isNight = gameState.phase === 'night';

  // 📱 ТЕЛЕФОН (макет Даші): ТЕКСТ ситуації видно одразу на місці,
  // а під ним ОДНА кнопка, яка відкриває вікно з варіантами вибору.
  //
  // Чому саме так: варіантів буває три, і в панельці внизу вони з'їдають
  // пів екрана. А сам текст ховати не можна — гравець має розуміти,
  // що відбувається, ще до того, як щось тисне.
  if (isMobileLayout() && card && !isNight && cardState.resolvedText === null) {
    zone.innerHTML = `
      <div class="card mobile-prompt">
        <p class="card-hint">📋 ${PHASE_NAMES[gameState.phase]} · є нова ситуація</p>
        <button class="btn card-open-btn" id="open-card">Подивитися</button>
      </div>`;
    document.getElementById('open-card').onclick = showCardModal;
    return;
  }

  // ніч або спокійна фаза — просто кнопка далі/спати
  if (isNight || !card) {
    zone.innerHTML = `
      <div class="phase-panel">
        <span class="phase-hint">${PHASE_QUIET[gameState.phase] || ''}</span>
        <button class="btn" id="next-btn">${isNight ? '🌙 Спати' : 'Далі ➤'}</button>
      </div>`;
    document.getElementById('next-btn').onclick = onNextClick;
    return;
  }

  // вибір зроблено — показуємо наслідок + плашки змін шкал
  if (cardState.resolvedText !== null) {
    const fx = cardState.resolvedEffects || {};
    const chips = Object.entries(fx).map(([stat, delta]) =>
      `<span class="effect-chip ${delta > 0 ? 'plus' : 'minus'}">
        ${STAT_ICONS[stat]} ${delta > 0 ? '+' : ''}${delta}${stat === 'money' ? '₴' : ''}
      </span>`
    ).join('');
    const effectsRow = chips
      ? `<div class="effects-row">${chips}</div>`
      : '<div class="effects-row"><span class="effect-chip neutral">без наслідків</span></div>';

    zone.innerHTML = `
      <div class="card">
        <p class="card-text card-result">${cardState.resolvedText}</p>
        ${effectsRow}
        <div class="card-choices"><button class="btn" id="next-btn">Далі ➤</button></div>
      </div>`;
    document.getElementById('next-btn').onclick = onNextClick;
    return;
  }

  // картка з варіантами; недоступні — сірі з причиною
  const buttons = card.choices.map((choice, i) => {
    if (choice.requires && gameState.stats[choice.requires.stat] < choice.requires.gte) {
      const icon = STAT_ICONS[choice.requires.stat];
      return `<button class="choice-btn locked" disabled>${choice.label}
        <span class="lock-reason">потрібно ${icon} ≥ ${choice.requires.gte}</span></button>`;
    }
    return `<button class="choice-btn" data-i="${i}">${choice.label}</button>`;
  }).join('');

  zone.innerHTML = `
    <div class="card">
      <p class="card-text">${card.text}</p>
      <div class="card-choices">${buttons}</div>
    </div>`;
  zone.querySelectorAll('.choice-btn[data-i]').forEach(btn => {
    btn.onclick = () => chooseOption(Number(btn.dataset.i));
  });
}

function onNextClick() {
  // шкала впала до нуля? гра закінчується тут
  const dead = checkGameOver();
  if (dead) {
    showGameOver(dead);
    return;
  }
  const result = advancePhase();
  if (result === 'night-end') {
    showNightSummary();
  } else {
    enterPhase(); // нова фаза → нова картка (або спокійна фаза)
  }
}

// ---------- тост-сповіщення (короткі спливаючі підказки над сценою) ----------
// showToast('текст') — з'являється зверху сцени і сам зникає за кілька секунд.
let toastTimer = null;
function showToast(text, ms = 4200) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.getElementById('scene-wrap').appendChild(t);
  }
  t.textContent = text;
  // рестарт анімації появи (якщо тост уже висів)
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- форс-мажор: термінове модальне вікно по центру (Етап 9) ----------
// Велика тематична іконка (fm.emoji), гучний заголовок (fm.title), пульсуючий
// «терміновий» акцент. Вибір → застосувати ефект → екран наслідку → «Далі».
// Якщо проблему не вирішено — наступного дня вікно ПОВТОРЮЄТЬСЯ (нагадування),
// з'являються додаткові варіанти (fm.reminderExtra) і кнопка «ігнорувати до кінця».
let fmCurrent = null;
let fmCurrentChoices = [];

function showForceMajeure(fm, isReminder) {
  fmCurrent = fm;
  // на нагадуваннях додаємо нові варіанти рішення, якщо задані в даних
  fmCurrentChoices = fm.choices.concat(isReminder && fm.reminderExtra ? fm.reminderExtra : []);

  const btns = fmCurrentChoices.map((c, i) => {
    const met = !c.requires || gameState.stats[c.requires.stat] >= c.requires.gte;
    if (!met) {
      return `<button class="btn locked-btn" disabled>${c.label}
        <span class="lock-reason">потрібно ${STAT_ICONS[c.requires.stat]} ≥ ${c.requires.gte}</span></button>`;
    }
    return `<button class="btn" data-i="${i}">${c.label}</button>`;
  }).join('');

  const badge = isReminder ? '⏳ ВСЕ ЩЕ ТРИВАЄ' : '⚡ ТЕРМІНОВО';
  const text = (isReminder && fm.reminderText) ? fm.reminderText : fm.text;
  // на нагадуваннях — кнопка «махнути рукою назавжди» (далі лише щоденний мінус)
  const ignoreBtn = isReminder
    ? `<button class="btn btn-secondary fm-ignore" id="fm-ignore">🙈 Ігнорувати до кінця</button>`
    : '';

  showOverlay(`
    <div class="window fm">
      <div class="fm-badge">${badge}</div>
      <div class="fm-emoji">${fm.emoji}</div>
      ${fm.title ? `<div class="fm-title">${fm.title}</div>` : ''}
      <p class="fm-text">${text}</p>
      <div class="card-choices fm-choices">${btns}</div>
      ${ignoreBtn}
    </div>`);

  document.querySelectorAll('#overlay .btn[data-i]').forEach(b => {
    b.onclick = () => onFMChoice(Number(b.dataset.i));
  });
  const ig = document.getElementById('fm-ignore');
  if (ig) ig.onclick = onFMIgnore;
}

function onFMChoice(index) {
  const r = applyChoiceObj(fmCurrent, fmCurrentChoices[index]);
  if (!r) return;
  renderHUD();
  showForceMajeureResult(fmCurrent, r);
}

// «ігнорувати до кінця»: більше не нагадувати, але щоденний мінус лишається
function onFMIgnore() {
  const st = fmState()[fmCurrent.id];
  if (st) st.ignored = true;
  if (typeof saveGame === 'function') saveGame();
  hideOverlay();
  onNextClick();
}

function showForceMajeureResult(fm, r) {
  showOverlay(`
    <div class="window fm resolved">
      <div class="fm-emoji">${fm.emoji}</div>
      <p class="fm-text card-result">${r.result}</p>
      ${effectChipsHtml(r.effects)}
      <div class="card-choices" style="justify-content:center">
        <button class="btn" id="fm-next">Далі ➤</button>
      </div>
    </div>`);
  document.getElementById('fm-next').onclick = () => { hideOverlay(); onNextClick(); };
}

// ---------- шопінг «побалувати себе» (Етап розширення) ----------
// Модалка по центру (як форс-мажор, але приємна): вибір, що купити.
// Дані — data/shopping.js; тригер — pickShopping у events.js.
// fromCheat=true — відкрито з чит-панелі: закрити без просування ходу гри
/**
 * 🛍️ КНОПКА МАГАЗИНУ — доступна завжди (ідея Даші).
 *
 * Раніше покупка була справою випадку: пощастило, що картка випала при
 * грошах. Тепер гравець може зайти сам — і тоді з'являється планування
 * («не витрачаю на таксі, копичу на принтер»), а не саме лише везіння.
 *
 * Ховаємо кнопку там, де вона недоречна: у редакторах, на стартовому
 * екрані й поки відкрите якесь вікно.
 */
function updateShopButton() {
  const btn = document.getElementById('shop-btn');
  if (!btn) return;

  // Стартовий екран і всі вікна — це той самий overlay, тому одна
  // перевірка покриває і «гра ще не почалась», і «зараз відкрито картку».
  const overlay = document.getElementById('overlay');
  const overlayOpen = overlay && !overlay.classList.contains('hidden');
  const inEditor = /geo/.test(location.hash);

  btn.style.display = (overlayOpen || inEditor) ? 'none' : 'block';

  // світиться, коли вистачає бодай на найдешевше — делікатне нагадування
  const cheapest = typeof SHOP_ITEMS !== 'undefined'
    ? Math.min(...SHOP_ITEMS.filter(i => !(gameState.flags.bought || {})[i.id]).map(i => i.price))
    : Infinity;
  btn.classList.toggle('can-afford', gameState.stats.money >= cheapest);
}

// вішаємо обробник один раз, коли сторінка готова
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('shop-btn');
  if (btn) btn.onclick = () => showShopping(true);  // true = не просувати хід
});

function showShopping(fromCheat = false) {
  shopFromCheat = fromCheat;
  const b = boughtState();
  const items = SHOP_ITEMS.filter(it => !b[it.id]); // лише некуплені
  const btns = items.map((it, i) => {
    const canAfford = gameState.stats.money >= it.price;
    if (!canAfford) {
      return `<button class="btn locked-btn" disabled>${it.emoji} ${it.label} — ${it.price}₴
        <span class="lock-reason">потрібно 💰 ≥ ${it.price}</span></button>`;
    }
    return `<button class="btn" data-i="${i}">${it.emoji} ${it.label} — ${it.price}₴</button>`;
  }).join('');

  showOverlay(`
    <div class="window shop">
      <div class="shop-badge">🛍️ ШОПІНГ</div>
      <div class="shop-emoji">💰</div>
      <div class="shop-title">Можна себе побалувати</div>
      <p class="fm-text">${SHOP_INTRO}</p>
      <div class="card-choices fm-choices">${btns}</div>
      <button class="btn btn-secondary" id="shop-skip">Іншим разом — відкладу</button>
    </div>`);

  document.querySelectorAll('#overlay .btn[data-i]').forEach(btn => {
    btn.onclick = () => buyItem(items[Number(btn.dataset.i)]);
  });
  document.getElementById('shop-skip').onclick = () => { hideOverlay(); if (!shopFromCheat) onNextClick(); };
}
let shopFromCheat = false; // магазин відкрито з чит-панелі (не просувати хід)

// купівля: списати гроші, застосувати ефекти, позначити куплено (з'явиться в кімнаті)
function buyItem(item) {
  if (gameState.stats.money < item.price) return; // страховка
  changeStat('money', -item.price);
  for (const [stat, delta] of Object.entries(item.effects || {})) changeStat(stat, delta);
  boughtState()[item.id] = true;                   // предмет назавжди в кімнаті
  if (item.opensBusiness) gameState.flags.microbusiness = true; // гачок мікробізнесу
  if (gameState.counters) gameState.counters.bought = (gameState.counters.bought || 0) + 1;
  saveGame();
  renderHUD();

  const chips = effectChipsHtml({ money: -item.price, ...(item.effects || {}) });
  showOverlay(`
    <div class="window shop resolved">
      <div class="shop-emoji">${item.emoji}</div>
      <p class="fm-text card-result">${item.result}</p>
      ${chips}
      <div class="card-choices" style="justify-content:center">
        <button class="btn" id="shop-next">Далі ➤</button>
      </div>
    </div>`);
  document.getElementById('shop-next').onclick = () => { hideOverlay(); if (!shopFromCheat) onNextClick(); };
}

// ---------- оверлей (спільний для всіх вікон) ----------

function showOverlay(html) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = html;
  overlay.classList.remove('hidden');
  updateShopButton();   // ховаємо кнопку магазину, поки відкрите вікно
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
  updateShopButton();   // вікно закрилось — кнопка знову доступна
}

// плашки змін шкал «⚡ −12 · 📚 +8» з набору ефектів (''+ якщо порожньо)
function effectChipsHtml(effects) {
  const chips = Object.entries(effects || {}).map(([stat, delta]) =>
    `<span class="effect-chip ${delta > 0 ? 'plus' : 'minus'}">
      ${STAT_ICONS[stat]} ${delta > 0 ? '+' : ''}${delta}${stat === 'money' ? '₴' : ''}
    </span>`
  ).join('');
  return chips ? `<div class="effects-row">${chips}</div>` : '';
}

// ---------- діалог сусіда (Етап 8) ----------
// npc = { emoji, name, dept }; bodyHtml — вміст; buttons — масив
// { label, onClick, locked?, reason?, secondary? }
function showDialog(npc, bodyHtml, buttons) {
  const btnHtml = buttons.map((b, i) => {
    if (b.locked) {
      return `<button class="btn locked-btn" disabled>${b.label}
        <span class="lock-reason">${b.reason || ''}</span></button>`;
    }
    return `<button class="btn ${b.secondary ? 'btn-secondary' : ''}" data-i="${i}">${b.label}</button>`;
  }).join('');

  showOverlay(`
    <div class="window dialog">
      <div class="dialog-head">
        <span class="dialog-emoji">${npc.emoji}</span>
        <span class="dialog-who"><b>${npc.name}</b></span>
      </div>
      ${bodyHtml}
      <div class="card-choices" style="justify-content:center">${btnHtml}</div>
    </div>`);

  document.querySelectorAll('#overlay .btn[data-i]').forEach(btn => {
    const b = buttons[Number(btn.dataset.i)];
    if (b.onClick) btn.onclick = b.onClick;
  });
}

// ---------- нічний підсумок ----------

function showNightSummary() {
  // згорнути лог дня: сумарна зміна кожної шкали
  const totals = {};
  for (const entry of gameState.dayLog) {
    totals[entry.stat] = (totals[entry.stat] || 0) + entry.delta;
  }
  const lines = STAT_META
    .filter(meta => totals[meta.key])
    .map(meta => {
      const v = totals[meta.key];
      return `<div>${meta.icon} ${meta.name}: ${v > 0 ? '+' : ''}${v}${meta.key === 'money' ? '₴' : ''}</div>`;
    })
    .join('') || '<div class="dim">Спокійний день — нічого не змінилось</div>';

  showOverlay(`
    <div class="window">
      <h2>🌙 День ${gameState.day} завершено</h2>
      <div class="summary">${lines}</div>
      <button class="btn" id="sleep-btn">Спати →</button>
    </div>`);
  document.getElementById('sleep-btn').onclick = () => {
    const result = startNewDay();
    // ранкові ефекти (голодний ранок −🧠) могли добити шкалу
    const dead = checkGameOver();
    if (dead) showGameOver(dead);
    else if (result === 'finale') showFinale();
    else showCalendar();
  };
}

// ---------- КАЛЕНДАРИК: вікно нового дня ----------
// Настінний календар «до стипендії»: минулі дні закреслені червоним,
// сьогоднішній обведений, вихідні підфарбовані.

function showCalendar() {
  const day = gameState.day;

  let cells = '';
  for (let d = 1; d <= CONFIG.TOTAL_DAYS; d++) {
    const classes = [
      'cal-cell',
      isWeekend(d) ? 'cal-weekend' : '',
      d < day ? 'cal-past' : '',
      d === day ? 'cal-today' : '',
    ].join(' ');
    cells += `<div class="${classes}">${d}${d < day ? '<span class="cal-cross">✗</span>' : ''}</div>`;
  }

  const weekendNote = isWeekend(day)
    ? '<div class="cal-note">Вихідний! Виспався: +15 ⚡</div>' : '';

  showOverlay(`
    <div class="window calendar">
      <h2>📅 До стипендії</h2>
      <div class="cal-head">${WEEKDAYS_SHORT.map(w => `<div>${w}</div>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-day-name">День ${day} — ${getWeekdayName(day)}</div>
      ${weekendNote}
      <button class="btn" id="start-day-btn">Почати день ➤</button>
    </div>`);
  document.getElementById('start-day-btn').onclick = () => {
    hideOverlay();
    enterPhase(); // ранкова картка нового дня
  };
}

// ---------- ГЕЙМ-ОВЕР: шкала впала до нуля ----------

function showGameOver(reason) {
  const day = gameState.day;
  showOverlay(`
    <div class="window gameover">
      <h2>${reason.icon} ${reason.title}</h2>
      <p class="card-text" style="text-align:center">${reason.text}</p>
      <p class="dim">Ти протримався ${day} з ${CONFIG.TOTAL_DAYS} днів.</p>
      <div class="card-choices" style="justify-content:center">
        ${hasSave() ? '<button class="btn" id="retry-day-btn">⟲ Переграти цей день</button>' : ''}
        <button class="btn btn-secondary" id="new-game-btn">✚ Нова гра</button>
      </div>
    </div>`);
  // сейв робиться щоранку — тож «переграти день» повертає на ранок дня смерті
  const retryBtn = document.getElementById('retry-day-btn');
  if (retryBtn) retryBtn.onclick = () => {
    loadGame();
    hideOverlay();
    enterPhase();
  };
  document.getElementById('new-game-btn').onclick = startFreshGame;
}

// ---------- ФІНАЛ: місяць прожито, рахуємо підсумки ----------

const ENDINGS = {
  champion: {
    icon: '🏆', title: 'Успішний у всьому',
    text: 'Виспаний, з грошима, з друзями і з конспектами. Деканат хоче твій портрет на дошку пошани, сусіди — твій секрет.',
  },
  burned: {
    icon: '💼', title: 'Вигорілий, але з грошима',
    text: 'Рахунок радує, очі — ні. Ти багатий студент з поглядом бухгалтера на пенсії. Може, наступного місяця поживеш?',
  },
  happy_poor: {
    icon: '☮️', title: 'Щасливий, але бідний',
    text: 'В кишені вітер, зате в кімнаті друзі і гітара до ранку. Мівіна смакує краще, коли її є з ким їсти.',
  },
  classic: {
    icon: '🎓', title: 'Класичний студент',
    text: 'Десь встиг, десь проспав, десь пощастило. Вижив — і це вже перемога. Справжній студент Політеху.',
  },
};

function showFinale() {
  const ending = computeEnding();
  const e = ENDINGS[ending.key];
  const c = gameState.counters;

  const moneyLines = `
    <div>${ending.stipend > 0
      ? `🎉 Стипендія: <b>+${ending.stipend}₴</b> (📚 ≥ 60 — заслужив!)`
      : `😬 Стипендії не буде: 📚 ${gameState.stats.study} < 60`}</div>
    ${ending.debt > 0 ? `<div>👓 Борг Ботанові (з відсотком): <b>−${ending.debt}₴</b></div>` : ''}
    <div>💰 Фінальний рахунок: <b>${ending.finalMoney}₴</b></div>`;

  showOverlay(`
    <div class="window finale">
      <h2>${e.icon} ${e.title}</h2>
      <p class="card-text" style="text-align:center">${e.text}</p>
      <div class="summary">${moneyLines}</div>
      <div class="final-stats dim">
        Статистика місяця: 📚 пар відвідано: ${c.lectures} ·
        💰 днів на підробітку: ${c.work} ·
        😴 разів проспав: ${c.sleepIns} ·
        🪳 Бориса помічено: ${c.boris} ·
        🩴 тарганів прибито: ${c.borisKilled || 0} ·
        🤝 квестів виконано: ${c.questsDone || 0} ·
        🛍️ покупок: ${c.bought || 0}
      </div>
      <button class="btn" id="new-game-btn">Ще один семестр ➤</button>
    </div>`);
  document.getElementById('new-game-btn').onclick = startFreshGame;
}

// ============================================
// Стартовий екран: Продовжити / Нова гра (Етап 4)
// ============================================

function showStartScreen() {
  const save = hasSave();

  // показати день із сейва на кнопці «Продовжити»
  let saveInfo = '';
  if (save) {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      saveInfo = ` (день ${data.day}/${CONFIG.TOTAL_DAYS})`;
    } catch (e) { /* нестрашно, покажемо без дня */ }
  }

  showOverlay(`
    <div class="window start">
      <h1 class="start-title">Складнощі студентського життя</h1>
      <p class="dim">Політех · общага «Одинадцятка» · 30 днів до стипендії</p>
      ${save ? `<button class="btn" id="continue-btn">▶ Продовжити${saveInfo}</button>` : ''}
      <button class="btn ${save ? 'btn-secondary' : ''}" id="newgame-btn">✚ Нова гра</button>
      <p class="dim start-hint">Прогрес зберігається автоматично щоранку</p>
    </div>`);

  if (save) {
    document.getElementById('continue-btn').onclick = () => {
      loadGame();
      hideOverlay();
      enterPhase();
    };
  }
  document.getElementById('newgame-btn').onclick = () => {
    if (save) showNewGameConfirm(); // є прогрес — перепитати!
    else startFreshGame();
  };
}

// підтвердження перед стиранням прогресу
function showNewGameConfirm() {
  showOverlay(`
    <div class="window">
      <h2>⚠ Почати заново?</h2>
      <p class="dim">Поточний прогрес буде стерто назавжди.</p>
      <div class="card-choices" style="justify-content: center">
        <button class="btn" id="confirm-erase-btn">Так, нова гра</button>
        <button class="btn btn-secondary" id="back-btn">Назад</button>
      </div>
    </div>`);
  document.getElementById('confirm-erase-btn').onclick = startFreshGame;
  document.getElementById('back-btn').onclick = showStartScreen;
}

function startFreshGame() {
  newGame();
  renderHUD();
  showIntro(); // спершу вступ-знайомство, далі — календарик першого дня
}

// ============================================
// Вступ-знайомство (нова гра): хто ти, де живеш, хто сусіди.
// Структура на майбутнє (Фаза 2): сюди легко додати вибір універу/общаги —
// поки що Політех + «Одинадцятка» фіксовані, а гравець обирає ім'я.
// {name} у тексті підставляється іменем гравця.
// ============================================

const INTRO_SLIDES = [
  {
    emoji: '🏙️', title: '«Одинадцятка»',
    body: 'Львів. Політех. Гуртожиток №11 — та сама «Віп-общага».<br>' +
          'Кімната на трьох хлопів, вид на студмістечко, таргани в комплекті.<br><br>' +
          '30 днів до стипендії. Погнали.',
  },
  {
    type: 'name', emoji: '🎓', title: 'А ти хто?',
    body: 'Другий курс, комп’ютерні науки. Худі, ноут, вічні дедлайни ' +
          'і кава як стиль життя.<br><br>Як тебе звати?',
  },
  {
    emoji: '🤓', title: 'Сусід знизу — «Ботан»',
    body: '«Вітаю. Мене звати Остап, прикладна математика, моє ліжко — нижнє. ' +
          'Будеш плавати в матаналі — кажи, поясню, файна ж наука. ' +
          'Тіко борщ мій з холодильника не руш — то святе. Приємно познайомитись, {name}.»',
  },
  {
    emoji: '🎸', title: 'Сусід згори — «Тусовщик»',
    body: '«Йоу, {name}! Я Максім, 3 курс менеджменту, живу на верхньому ярусі. ' +
          'Гітара є, вайб є. І так, я в курсі, шо гулянка о третій ночі — ' +
          'то трохи занадто. Але ж весело буде, ти за?»',
  },
  {
    emoji: '🛏️', title: 'Заселяйся',
    body: 'Твоє ліжко — праворуч, під вікном. Ноут на стіл, худі на стілець. ' +
          'Обживайся, {name}.<br><br>Місяць буде… насиченим.',
  },
];

function showIntro(step = 0) {
  const slide = INTRO_SLIDES[step];
  const isLast = step === INTRO_SLIDES.length - 1;
  const name = (gameState.student && gameState.student.fullName) || 'Студент';
  const body = slide.body.replace(/\{name\}/g, name);

  const nameField = slide.type === 'name'
    ? `<input type="text" id="intro-name" class="intro-name" maxlength="16"
         placeholder="Студент" value="${gameState.student.fullName === 'Студент' ? '' : gameState.student.fullName}">`
    : '';

  showOverlay(`
    <div class="window intro">
      <div class="intro-emoji">${slide.emoji}</div>
      <h2 class="intro-title">${slide.title}</h2>
      <p class="intro-body">${body}</p>
      ${nameField}
      <button class="btn" id="intro-next">${isLast ? '🚪 Заселитися ➤' : 'Далі ➤'}</button>
    </div>`);

  const input = document.getElementById('intro-name');
  if (input) setTimeout(() => input.focus(), 50);

  document.getElementById('intro-next').onclick = () => {
    if (input) {
      const v = input.value.trim();
      gameState.student.fullName = v || 'Студент';
      saveGame();
    }
    if (isLast) { hideOverlay(); showCalendar(); }
    else showIntro(step + 1);
  };
}

// ============================================
// Чит-панель (Етап 6): клавіша D — повзунки шкал і перемикач фаз,
// щоб миттєво дивитись, як кімната реагує на стан гри
// ============================================

function toggleCheatPanel() {
  let panel = document.getElementById('cheat');
  if (panel) {
    panel.classList.toggle('hidden');
    return;
  }

  panel = document.createElement('div');
  panel.id = 'cheat';

  const sliders = STAT_META.map(meta => {
    const max = meta.key === 'money' ? 3000 : 100;
    return `
      <label class="cheat-row">${meta.icon}
        <input type="range" min="0" max="${max}" step="5"
               data-stat="${meta.key}" value="${gameState.stats[meta.key]}">
        <span class="cheat-val" id="cheat-val-${meta.key}">${gameState.stats[meta.key]}</span>
      </label>`;
  }).join('');

  const phases = PHASES.map(p =>
    `<button class="cheat-phase" data-phase="${p}">${PHASE_NAMES[p]}</button>`
  ).join('');

  panel.innerHTML = `
    <div class="cheat-title">ЧИТ-ПАНЕЛЬ <span class="dim">(D — сховати)</span></div>
    ${sliders}
    <div class="cheat-phases">${phases}</div>
    <div class="cheat-phases">
      <button class="cheat-phase" id="cheat-shop">🛒 Магазин</button>
      <button class="cheat-phase" id="cheat-ai">🤖 Картка від ШІ</button>
    </div>
    <div class="cheat-ai-status" id="cheat-ai-status">🤖 ШІ: —</div>`;
  document.body.appendChild(panel);

  // 🤖 стан ШІ живою мовою: чи працює, скільки карток, що зламалось.
  // Оновлюється раз на секунду, поки панель відкрита.
  const aiStatusEl = panel.querySelector('#cheat-ai-status');
  const refreshAiStatus = () => {
    if (!document.body.contains(panel)) return clearInterval(aiStatusTimer);
    aiStatusEl.textContent = '🤖 ШІ: ' +
      (typeof aiStatusText === 'function' ? aiStatusText() : 'ai.js не підключено');
  };
  const aiStatusTimer = setInterval(refreshAiStatus, 1000);
  refreshAiStatus();

  // замовити ШІ-картку просто зараз і показати, щойно прийде
  panel.querySelector('#cheat-ai').onclick = () => {
    if (typeof aiPrefetch !== 'function') return;
    showToast('🤖 Прошу картку в ШІ…');
    aiPrefetch().then(() => {
      const card = aiState.queue.shift();
      if (!card) return showToast('❌ ШІ не дав картку — дивись стан у панелі');
      aiNoteTopic(card.topic);
      cardState.card = card;
      cardState.resolvedText = null;
      cardState.resolvedEffects = null;
      renderHUD();
      renderDecisionZone();
    });
  };

  // 🛒 відкрити шопінг примусово (оминає поріг грошей і кулдаун) — для розробника
  panel.querySelector('#cheat-shop').onclick = () => {
    if (typeof showShopping === 'function') showShopping(true);
  };

  panel.querySelectorAll('input[type=range]').forEach(input => {
    input.oninput = () => {
      gameState.stats[input.dataset.stat] = Number(input.value);
      document.getElementById('cheat-val-' + input.dataset.stat).textContent = input.value;
      renderHUD();
    };
  });
  // лише кнопки фаз (у кнопки магазину теж клас cheat-phase, але без data-phase)
  panel.querySelectorAll('.cheat-phase[data-phase]').forEach(btn => {
    btn.onclick = () => {
      gameState.phase = btn.dataset.phase;
      renderHUD();
      renderDecisionZone();
    };
  });
}
