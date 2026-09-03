// ============================================
// minigames.js — МІНІГРИ (ідея Даші)
//
// Куплені предмети стають клікабельними, як сусіди, і дають окрему активність:
//   🎮 монік + Xbox — «гра в грі»: меню аркад (поки одна — «Борис біжить»)
//   🖨️ принтер     — мікробізнес (буде окремо: «!» над принтером → проблема)
//
// ПРАВИЛО БАЛАНСУ: аркади дають переважно 🧠 (розважився) і трохи 👥, а НЕ
// гроші. Інакше мінігра стає способом фармити стипендію і ламає всю економіку.
//
// Тест: index.html#boris-run — одразу запустити гру про Бориса.
// ============================================

// ---------- НАЛАШТУВАННЯ (пісочниця Даші) ----------

const MINIGAME_ENERGY = 6;     // ⚡ скільки з'їдає один захід
const MINIGAME_PER_DAY = 2;    // скільки разів на день можна грати
const RUN_MENTAL_MAX = 12;     // 🧠 максимум за один вдалий забіг

// ---------- спільне: чи можна зараз грати ----------

function minigamesPlayedToday() {
  const f = gameState.flags;
  if (f.mgDay !== gameState.day) { f.mgDay = gameState.day; f.mgCount = 0; }
  return f.mgCount || 0;
}

function minigameCanPlay() {
  if (minigamesPlayedToday() >= MINIGAME_PER_DAY) return 'Сьогодні вже награвся. Завтра ще.';
  if (gameState.stats.energy < MINIGAME_ENERGY) return 'Сил нема навіть на джойстик.';
  return null; // можна
}

function minigameSpend() {
  gameState.flags.mgCount = minigamesPlayedToday() + 1;
  changeStat('energy', -MINIGAME_ENERGY);
}

// ---------- клік по куплених предметах ----------

// Які предмети клікабельні і що відкривають.
//
// hit — ЗОНА КЛІКУ в ПІКСЕЛЯХ СЦЕНИ (лівий верхній кут + розмір).
// Чому в абсолютних, а не «частка від спрайта»: спрайти бувають різні —
// monitor_xbox.png узагалі на всю сцену (1672×941), тому частка від нього
// давала зону в пів кімнати, і клік по килимку відкривав меню.
//
// ЯК НАЛАШТУВАТИ: відкрий index.html#props-geo — зона намальована зеленою
// рамкою з підписом. Правиш числа тут, оновлюєш сторінку, дивишся.
const CLICKABLE_PROPS = {
  monitor_xbox: {
    open: () => showXboxMenu(),
    icon: '🎮',
    // світиться, поки лишились заходи на сьогодні
    active: () => !minigameCanPlay(),
    hit: { x: 1288, y: 532, w: 135, h: 95 }, // сам екран монітора на столі
  },
  printer: {
    open: () => openPrinter(),
    icon: '❗',
    // світиться ТІЛЬКИ коли є замовлення або проблема (ідея Даші)
    active: () => !!printerPending(),
    hit: { x: 1105, y: 700, w: 150, h: 100 }, // сам принтер на тумбі
  },
};

// прямокутник зони кліку предмета (у координатах сцени)
function clickableRect(p) {
  return CLICKABLE_PROPS[p.id].hit;
}

// предмет під точкою (тільки куплений і видимий)
function clickablePropAt(pos) {
  if (typeof PROPS === 'undefined') return null;
  for (let i = PROPS.length - 1; i >= 0; i--) {
    const p = PROPS[i];
    if (!CLICKABLE_PROPS[p.id]) continue;
    if (!propActive(p) || p.alpha < 0.5) continue; // ще не куплений / зникає
    const r = clickableRect(p);
    if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) return p;
  }
  return null;
}

// ---------- підказка на сцені: предмет можна натиснути ----------
// М'яке світіння + іконка над предметом. Коли ліміт на сьогодні вичерпано —
// тьмяно і без пульсації, щоб не манило даремно. Викликає scene.js.
function renderClickableHints(ctx, now) {
  if (typeof PROPS === 'undefined') return;

  for (const p of PROPS) {
    const cfg = CLICKABLE_PROPS[p.id];
    if (!cfg || !propActive(p) || p.alpha < 0.5) continue;

    const free = cfg.active ? cfg.active() : true; // чи є зараз що робити
    const r = clickableRect(p);
    const cx = r.x + r.w / 2;
    const top = r.y;
    const pulse = free ? 0.5 + Math.sin(now * 0.004) * 0.5 : 0; // 0..1

    ctx.save();
    ctx.globalAlpha = p.alpha;

    // світіння довкола предмета
    const glow = ctx.createRadialGradient(cx, r.y + r.h / 2, 8, cx, r.y + r.h / 2, r.w * 0.9);
    const strength = free ? 0.10 + pulse * 0.16 : 0.06;
    glow.addColorStop(0, `rgba(255, 220, 130, ${strength})`);
    glow.addColorStop(1, 'rgba(255, 220, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r.w, r.y - r.h * 0.6, r.w * 2, r.h * 2.2);

    // іконка над предметом, легенько підстрибує
    const bob = free ? Math.sin(now * 0.004) * 4 : 0;
    ctx.globalAlpha = p.alpha * (free ? 0.75 + pulse * 0.25 : 0.35);
    ctx.font = '38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.icon, cx, top - 14 + bob);

    ctx.restore();
  }
}

window.addEventListener('click', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  if (typeof npcInteractive === 'function' && !npcInteractive()) return;
  const pos = borisSceneCoords(e, canvas);
  if (typeof borisHitTest === 'function' && borisHitTest(pos.x, pos.y)) return; // тапок
  const p = clickablePropAt(pos);
  if (p) CLICKABLE_PROPS[p.id].open();
});

window.addEventListener('mousemove', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  if (typeof npcInteractive === 'function' && !npcInteractive()) return;
  const pos = borisSceneCoords(e, canvas);
  if (clickablePropAt(pos)) canvas.style.cursor = 'pointer';
});

// ---------- 🎮 МЕНЮ XBOX ----------
// Сюди доливаються нові аркади: просто ще один рядок у ARCADES.

const ARCADES = [
  {
    id: 'boris_run',
    emoji: '🪳',
    title: 'БОРИС БІЖИТЬ',
    desc: 'Тарган тікає з кімнати. Тисни, щоб стрибати.',
    start: () => startBorisRun(),
  },
];

function showXboxMenu() {
  const blocked = minigameCanPlay();
  const left = MINIGAME_PER_DAY - minigamesPlayedToday();

  const items = ARCADES.map((a, i) => `
    <button class="btn arcade-item" data-i="${i}" ${blocked ? 'disabled' : ''}>
      <span class="arcade-emoji">${a.emoji}</span>
      <span class="arcade-name">${a.title}</span>
      <span class="arcade-desc">${a.desc}</span>
    </button>`).join('');

  showOverlay(`
    <div class="window arcade-menu">
      <div class="arcade-badge">🎮 XBOX</div>
      <div class="arcade-title">У що зіграємо?</div>
      <p class="fm-text">${blocked
        ? `<span class="arcade-blocked">${blocked}</span>`
        : `Сусіди вже підтягуються. Заходів лишилось: ${left} · коштує ⚡${MINIGAME_ENERGY}`}</p>
      <div class="arcade-list">${items}</div>
      <button class="btn btn-secondary" id="arcade-close">Потім</button>
    </div>`);

  document.querySelectorAll('#overlay .arcade-item').forEach(btn => {
    btn.onclick = () => ARCADES[Number(btn.dataset.i)].start();
  });
  document.getElementById('arcade-close').onclick = hideOverlay;
}

// ============================================
// 🖨️ ПРИНТЕР — мікробізнес (ідея Даші)
//
// Раз на день над принтером може засвітитись ❗ — там або замовлення
// (сусіди просять надрукувати → заробіток), або проблема (скінчилась фарба,
// зажувало папір → витрати). Натиснув — розібрався.
// Події — data/printer.js.
// ============================================

// Шанс, що за день з'явиться подія (0.7 = приблизно 7 днів з 10).
const PRINTER_EVENT_CHANCE = 0.7;
// Проблеми не мають сипатись частіше за замовлення — інакше бізнес у мінус.
const PRINTER_TROUBLE_SHARE = 0.35;

function printerState() {
  if (!gameState.flags.printer) gameState.flags.printer = { pending: null, day: 0 };
  return gameState.flags.printer;
}

// яка подія зараз висить над принтером (або null)
function printerPending() {
  if (typeof PRINTER_EVENTS === 'undefined') return null;
  if (!gameState.flags.bought || !gameState.flags.bought.printer) return null;
  const st = printerState();
  return st.pending ? PRINTER_EVENTS.find(e => e.id === st.pending) || null : null;
}

// Щоранку вирішуємо, чи буде сьогодні подія. Викликає startNewDay (state.js).
function printerTick() {
  if (typeof PRINTER_EVENTS === 'undefined') return;
  if (!gameState.flags.bought || !gameState.flags.bought.printer) return;
  const st = printerState();
  if (st.day === gameState.day) return;   // на сьогодні вже вирішили
  st.day = gameState.day;

  if (Math.random() > PRINTER_EVENT_CHANCE) { st.pending = null; return; }

  const wantTrouble = Math.random() < PRINTER_TROUBLE_SHARE;
  const kind = wantTrouble ? 'trouble' : 'order';
  const pool = PRINTER_EVENTS.filter(e => e.kind === kind);
  st.pending = pool[Math.floor(Math.random() * pool.length)].id;

  if (typeof showToast === 'function') {
    showToast(wantTrouble ? '🖨️ З принтером щось не так…' : '🖨️ Хтось хоче щось надрукувати!');
  }
}

function openPrinter() {
  const ev = printerPending();

  // натиснув, коли нічого не висить — просто спокійна репліка
  if (!ev) {
    showOverlay(`
      <div class="window printer-win">
        <div class="printer-badge">🖨️ ПРИНТЕР</div>
        <p class="fm-text">Стоїть, тихо блимає лампочкою. Замовлень зараз нема —
        але в общазі це ненадовго.</p>
        <button class="btn btn-secondary" id="printer-close">Ясно</button>
      </div>`);
    document.getElementById('printer-close').onclick = hideOverlay;
    return;
  }

  const btns = ev.choices.map((c, i) => {
    const locked = c.requires && gameState.stats[c.requires.stat] < c.requires.gte;
    if (locked) {
      return `<button class="btn locked-btn" disabled>${c.label}
        <span class="lock-reason">потрібно ${STAT_ICONS[c.requires.stat]} ≥ ${c.requires.gte}</span></button>`;
    }
    return `<button class="btn" data-i="${i}">${c.label}</button>`;
  }).join('');

  showOverlay(`
    <div class="window printer-win">
      <div class="printer-badge">${ev.kind === 'trouble' ? '🛠️ ПРОБЛЕМА' : '💼 ЗАМОВЛЕННЯ'}</div>
      <div class="printer-emoji">${ev.emoji}</div>
      <p class="fm-text">${ev.text}</p>
      <div class="card-choices fm-choices">${btns}</div>
    </div>`);

  document.querySelectorAll('#overlay .btn[data-i]').forEach(btn => {
    btn.onclick = () => onPrinterChoice(ev, ev.choices[Number(btn.dataset.i)]);
  });
}

function onPrinterChoice(ev, choice) {
  // застосовуємо вибір тим самим двигуном, що й картки (підтримує roll)
  const r = applyChoiceObj(ev, choice);
  if (!r) return;

  printerState().pending = null; // питання закрито, ❗ гасне
  saveGame();
  renderHUD();

  showOverlay(`
    <div class="window printer-win resolved">
      <div class="printer-emoji">${ev.emoji}</div>
      <p class="fm-text card-result">${r.result}</p>
      ${effectChipsHtml(r.effects)}
      <button class="btn" id="printer-next">Далі ➤</button>
    </div>`);
  document.getElementById('printer-next').onclick = hideOverlay;
}

// ============================================
// 🪳 «БОРИС БІЖИТЬ» — нескінченний біг
// Одна кнопка (клік / пробіл / ↑) = стрибок. Перешкоди наїжджають зліва
// направо, швидкість поволі росте. Зачепив — кінець.
// Увесь арт — кодом (як сам Борис у boris.js), жодних спрайтів не треба.
// ============================================

// --- налаштування забігу (крути сміливо) ---
const RUN_W = 760;            // ширина поля
const RUN_H = 260;            // висота поля
const RUN_GROUND = 210;       // де підлога
const RUN_SPEED_0 = 5.2;      // початкова швидкість
const RUN_SPEED_UP = 0.0012;  // наскільки прискорюється за кадр
const RUN_GRAVITY = 0.62;
const RUN_JUMP = -12.4;       // сила стрибка (від'ємна — вгору)

const runState = {
  raf: null, running: false,
  x: 0, y: 0, vy: 0, onGround: true,
  speed: RUN_SPEED_0, dist: 0, obstacles: [], nextIn: 60, legs: 0,
};

function startBorisRun() {
  const blocked = minigameCanPlay();
  if (blocked) return;
  minigameSpend();
  renderHUD();

  showOverlay(`
    <div class="window arcade-game">
      <div class="arcade-hud">
        <span class="arcade-badge">🪳 БОРИС БІЖИТЬ</span>
        <span id="run-score">0 м</span>
      </div>
      <canvas id="run-canvas" width="${RUN_W}" height="${RUN_H}"></canvas>
      <p class="arcade-hint" id="run-hint">Клік або <b>пробіл</b> — стрибок. Не влети в тапок!</p>
    </div>`);

  Object.assign(runState, {
    running: true, x: 90, y: RUN_GROUND, vy: 0, onGround: true,
    speed: RUN_SPEED_0, dist: 0, obstacles: [], nextIn: 70, legs: 0,
  });

  const canvas = document.getElementById('run-canvas');

  // ⚠️ КЕРУВАННЯ: три способи, і кожен потрібен.
  //
  // mousedown — миша на комп'ютері.
  // keydown   — пробіл / стрілка вгору.
  // touchstart — ПАЛЕЦЬ. Без нього гра не працювала на iPhone.
  //
  // Чому mousedown не рятує на телефоні: браузер підробляє «мишачі» події
  // з дотиків, але Safari на iOS робить це лише для тих елементів, які
  // вважає клікабельними (кнопки, посилання). Голий <canvas> для нього —
  // картинка, тож дотик не перетворюється ні на що. Android так не робить —
  // тому на телефоні друга все працювало, а на айфоні ні. Та сама причина,
  // що й із тапами по кімнаті (див. js/main.js, init).
  //
  // preventDefault у touchstart прибирає одразу дві біди: підроблений
  // mousedown услід за дотиком (інакше стрибок рахувався б двічі) і
  // «гумове» протягування сторінки під час гри.
  canvas.addEventListener('mousedown', runJump);
  canvas.addEventListener('touchstart', runTouch, { passive: false });
  window.addEventListener('keydown', runKey);

  runLoop();
}

function runKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    runJump();
  }
}

// дотик пальцем = стрибок (див. пояснення у startBorisRun)
function runTouch(e) {
  e.preventDefault();
  runJump();
}

function runJump() {
  if (!runState.running || !runState.onGround) return;
  runState.vy = RUN_JUMP;
  runState.onGround = false;
}

// Перешкоди: що трапляється таргану в общазі.
// СПРАЙТИ: поклади PNG у assets/sprites/minigame/<kind>.png — і предмет
// малюватиметься картинкою замість коду. Файлу нема — малюємо кодом,
// гра не чекає на графіку (те саме правило, що в props.js).
// Розмір w×h — у пікселях поля гри; спрайт розтягнеться під нього,
// тому малюй у пропорціях, близьких до цих.
// Розміри = справжні розміри спрайтів Даші після обробки
// (tools/process_minigame.html: хромакей → найбільший острівець → обрізка →
// масштаб під висоту). Стрибок піднімає Бориса приблизно на 120 px,
// тому навіть найвищий балончик (54) перестрибується з запасом.
const RUN_OBSTACLES = [
  { kind: 'slipper', w: 96,  h: 46 }, // тапок — класика
  { kind: 'spray',   w: 26,  h: 66 }, // балончик з отрутою (найвищий)
  { kind: 'puddle',  w: 83,  h: 22 }, // калюжа (з форс-мажору!) — найлегша
  { kind: 'shoe',    w: 107, h: 56 }, // кросівок сусіда (найбільший)
];

// На скільки пікселів опустити перешкоди й Бориса нижче лінії підлоги,
// щоб вони стояли НА ній, а не висіли в повітрі. Підлога намальована
// з перспективою (йде вперед), тому предмети мають трохи заходити на неї.
// Це тільки малювання — на зіткнення й складність не впливає.
const RUN_SINK = 11;

// завантаження спрайтів перешкод (відсутній файл — не помилка)
const RUN_SPRITES = {};
for (const o of RUN_OBSTACLES) {
  const img = new Image();
  img.ready = false;
  img.onload = () => { img.ready = true; };
  img.onerror = () => { img.ready = false; };
  img.src = `assets/sprites/minigame/${o.kind}.png`;
  RUN_SPRITES[o.kind] = img;
}
// Бориса малюємо КОДОМ (див. runDrawBoris) — так само, як у кімнаті.
// Спрайт не потрібен: намальований тарган виходить живий, ще й рухає
// лапками й вусами, чого нерухома картинка не вміє.
const RUN_BORIS_IMG = { ready: false };
const RUN_BORIS_W = 46;
const RUN_BORIS_H = 30;

function runLoop() {
  const canvas = document.getElementById('run-canvas');
  if (!canvas || !runState.running) return;
  const ctx = canvas.getContext('2d');
  const s = runState;

  // --- фізика ---
  s.speed += RUN_SPEED_UP;
  s.dist += s.speed;
  s.legs += s.speed * 0.5;

  s.vy += RUN_GRAVITY;
  s.y += s.vy;
  if (s.y >= RUN_GROUND) { s.y = RUN_GROUND; s.vy = 0; s.onGround = true; }

  // --- поява перешкод ---
  if (--s.nextIn <= 0) {
    const o = RUN_OBSTACLES[Math.floor(Math.random() * RUN_OBSTACLES.length)];
    s.obstacles.push({ ...o, x: RUN_W + 20 });
    // що швидше біжимо, то тісніше — але завжди лишаємо шанс встигнути
    s.nextIn = Math.max(46, Math.round(150 - s.speed * 6 + Math.random() * 60));
  }
  for (const o of s.obstacles) o.x -= s.speed;
  s.obstacles = s.obstacles.filter(o => o.x > -90);

  // --- зіткнення (хіт-бокс трохи менший за вигляд — щоб не було прикро) ---
  const bx = s.x, by = s.y;
  for (const o of s.obstacles) {
    const hit = bx + 11 > o.x + 4 && bx - 11 < o.x + o.w - 4
             && by > RUN_GROUND - o.h + 3;
    if (hit) return endBorisRun();
  }

  // --- малюємо ---
  runDraw(ctx, s);

  // Рахунок у САНТИМЕТРАХ — для таргана чесніша одиниця, ніж метри.
  // Дільник 30 (а не 3): інакше числа роздувались до чотиризначних,
  // і «2282 см» читалось гірше, ніж «228 см» за той самий забіг.
  const score = document.getElementById('run-score');
  if (score) score.textContent = `${Math.floor(s.dist / 30)} см`;

  s.raf = requestAnimationFrame(runLoop);
}

function runDraw(ctx, s) {
  // фон — коридор общаги, темний і трохи тривожний
  const sky = ctx.createLinearGradient(0, 0, 0, RUN_H);
  sky.addColorStop(0, '#2a2136');
  sky.addColorStop(1, '#1a1524');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, RUN_W, RUN_H);

  // двері вздовж коридору — біжать назад, дають відчуття руху
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 240) - (s.dist * 0.35 % 240));
    ctx.fillRect(x, RUN_GROUND - 120, 62, 120);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.10)'; // світло з-під дверей
    ctx.fillRect(x + 4, RUN_GROUND - 6, 54, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
  }

  // лампи під стелею — блимають, як у справжній общазі
  for (let i = 0; i < 4; i++) {
    const x = ((i * 300) - (s.dist * 0.5 % 300));
    const dim = Math.sin(s.dist * 0.03 + i) > -0.9 ? 0.16 : 0.05; // інколи «моргає»
    const g = ctx.createRadialGradient(x, 10, 4, x, 10, 90);
    g.addColorStop(0, `rgba(255, 230, 170, ${dim})`);
    g.addColorStop(1, 'rgba(255, 230, 170, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 90, 0, 180, 120);
  }

  // плінтус і підлога
  ctx.fillStyle = '#3b2f22';
  ctx.fillRect(0, RUN_GROUND + 2, RUN_W, RUN_H - RUN_GROUND);
  ctx.strokeStyle = '#5a4630';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, RUN_GROUND + 3); ctx.lineTo(RUN_W, RUN_GROUND + 3); ctx.stroke();

  // смуги паркету, що біжать назад — відчуття швидкості
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const x = ((i * 90) - (s.dist % 90));
    ctx.beginPath(); ctx.moveTo(x, RUN_GROUND + 8); ctx.lineTo(x - 26, RUN_H); ctx.stroke();
  }

  // перешкоди
  for (const o of s.obstacles) runDrawObstacle(ctx, o);

  // Борис. Масштаб 1.2 — щоб читався, але лишався МЕНШИМ за тапок:
  // тарган більший за взуття виглядав неправильно.
  ctx.save();
  ctx.translate(s.x, s.y + RUN_SINK);
  ctx.scale(1.2, 1.2);
  runDrawBoris(ctx, s);
  ctx.restore();
}

// Борис у профіль, біжить праворуч.
// Є спрайт — малюємо його; нема — арт кодом (як у boris.js).
function runDrawBoris(ctx, s) {
  if (RUN_BORIS_IMG.ready) {
    // легке погойдування на бігу і нахил у стрибку
    const bob = s.onGround ? Math.sin(s.legs) * 1.5 : 0;
    ctx.save();
    if (!s.onGround) ctx.rotate(-0.12);
    ctx.drawImage(RUN_BORIS_IMG, -RUN_BORIS_W / 2, -RUN_BORIS_H + bob, RUN_BORIS_W, RUN_BORIS_H);
    ctx.restore();
    return;
  }

  const air = !s.onGround;
  // лапки: три пари, крокують; у польоті — підібгані
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 2.5;
  for (let i = -1; i <= 1; i++) {
    const step = air ? -3 : Math.sin(s.legs + i * 2.1) * 5;
    ctx.beginPath();
    ctx.moveTo(i * 8, -3);
    ctx.lineTo(i * 8 + step, 4);
    ctx.stroke();
  }

  // тіло
  ctx.fillStyle = '#2e1c10';
  ctx.strokeStyle = '#1a0f07';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -9, 15, 7, air ? -0.15 : 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // блік на спинці
  ctx.strokeStyle = 'rgba(150, 105, 60, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, -13); ctx.lineTo(7, -13); ctx.stroke();

  // голова
  ctx.fillStyle = '#241509';
  ctx.beginPath();
  ctx.ellipse(15, -8, 5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // вуса — розвіваються назад від бігу
  const sway = Math.sin(s.legs * 0.6) * 3;
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(18, -10);
  ctx.quadraticCurveTo(26, -16 + sway, 33, -14 + sway);
  ctx.moveTo(18, -8);
  ctx.quadraticCurveTo(27, -10 - sway, 34, -6 - sway);
  ctx.stroke();
}

function runDrawObstacle(ctx, o) {
  const y = RUN_GROUND + RUN_SINK; // трохи нижче лінії — стоїть на підлозі

  // є намальований спрайт — малюємо його (низ по землі)
  const img = RUN_SPRITES[o.kind];
  if (img && img.ready) {
    ctx.drawImage(img, o.x, y - o.h, o.w, o.h);
    return;
  }

  // спрайта ще нема — заглушка кодом
  ctx.save();
  ctx.translate(o.x, y);

  if (o.kind === 'slipper') {
    ctx.fillStyle = '#8b3a3a';           // підошва
    ctx.beginPath();
    ctx.ellipse(o.w / 2, -6, o.w / 2, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b45252';           // перемичка
    ctx.beginPath();
    ctx.ellipse(o.w / 2, -14, o.w / 3, 8, 0, Math.PI, 0);
    ctx.fill();
  } else if (o.kind === 'spray') {
    ctx.fillStyle = '#4a7c3f';           // балончик отрути
    ctx.fillRect(0, -o.h, o.w, o.h);
    ctx.fillStyle = '#7fc06a';
    ctx.fillRect(2, -o.h + 6, o.w - 4, 10);
    ctx.fillStyle = '#333';               // ковпачок
    ctx.fillRect(4, -o.h - 7, o.w - 8, 7);
  } else if (o.kind === 'puddle') {
    ctx.fillStyle = 'rgba(80, 150, 210, 0.75)';
    ctx.beginPath();
    ctx.ellipse(o.w / 2, -4, o.w / 2, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; // блиск
    ctx.beginPath();
    ctx.ellipse(o.w / 2 - 8, -6, 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else { // shoe — кросівок сусіда
    ctx.fillStyle = '#3d4557';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -o.h + 8);
    ctx.quadraticCurveTo(o.w * 0.5, -o.h - 2, o.w, -10);
    ctx.lineTo(o.w, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';            // підошва
    ctx.fillRect(0, -8, o.w, 8);
  }
  ctx.restore();
}

// ---------- кінець забігу і нагорода ----------

function endBorisRun() {
  const s = runState;
  s.running = false;
  if (s.raf) cancelAnimationFrame(s.raf);
  window.removeEventListener('keydown', runKey);

  const cm = Math.floor(s.dist / 30);

  // рекорд — у фінальну статистику
  const best = Math.max(cm, gameState.counters.borisRunBest || 0);
  gameState.counters.borisRunBest = best;

  // 🧠 за розвагу: що далі забіг, то веселіше (стеля — RUN_MENTAL_MAX).
  // Максимум набігає приблизно на 300 см.
  const mental = Math.max(2, Math.min(RUN_MENTAL_MAX, Math.round(cm / 25)));
  const effects = { mental };
  // далекий забіг — є чим похвалитись перед сусідами
  if (cm >= 220) effects.social = 3;
  for (const [stat, d] of Object.entries(effects)) changeStat(stat, d);
  saveGame();
  renderHUD();

  const verdict = cm >= 300 ? 'Борис — легенда поверху!'
    : cm >= 150 ? 'Непогано пробіг як для таргана.'
    : cm >= 60 ? 'Тапок виявився швидшим.'
    : 'Ну... Борис хоча б спробував.';

  // Кнопку «Ще раз» показуємо ЗАВЖДИ. Якщо грати не можна — вона неактивна
  // і сама пояснює причину: раніше кнопка просто зникала, і було незрозуміло,
  // чи це так задумано, чи щось зламалось.
  const blocked = minigameCanPlay();

  showOverlay(`
    <div class="window arcade-game resolved">
      <div class="arcade-badge">🪳 ЗАБІГ ЗАВЕРШЕНО</div>
      <div class="arcade-score">${cm} см</div>
      <p class="fm-text">${verdict}${best === cm && cm > 0 ? '<br><b>Новий рекорд!</b>' : `<br>Рекорд: ${best} см`}</p>
      ${effectChipsHtml(effects)}
      <div class="card-choices" style="justify-content:center">
        ${blocked
          ? `<button class="btn locked-btn" disabled>🔁 Ще раз
               <span class="lock-reason">${blocked}</span></button>`
          : '<button class="btn" id="run-again">🔁 Ще раз</button>'}
        <button class="btn btn-secondary" id="run-exit">Досить</button>
      </div>
    </div>`);

  const again = document.getElementById('run-again');
  if (again) again.onclick = () => startBorisRun();
  document.getElementById('run-exit').onclick = hideOverlay;
}
