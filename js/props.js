// ============================================
// props.js — предметні шари станів (хвіст Етапу 6, «кімната-дзеркало»)
//
// Ідея: шкали гравця вмикають/вимикають предмети в кімнаті.
// Бідність → мівіна і коробки; багатство → телевізор і вазон;
// занедбане навчання → розкидані листки; низька менталочка → купа одягу.
//
// Кожен предмет — окремий прозорий PNG у assets/sprites/props/<id>.png
// (генерація на маджента-фоні → tools/asset_processor.html → сюди).
// Файл НЕобов'язковий: поки спрайта нема — предмет просто не малюється,
// гра не чекає на графіку (правило з ART_DESIGN).
//
// Редактор: index.html#props-geo — видно ВСІ предмети (без спрайта —
// пунктирна рамка), тягни мишкою, колесо миші = масштаб,
// координати списуй у PROPS нижче.
// ============================================

// Пороги «бідний/багатий» у гривнях (шкали 0–100 мають свої в when).
// Числа — пісочниця Даші: крути як відчувається.
const PROP_MONEY_LOW = 300;   // 💰 нижче — на столі мівіна і коробки
const PROP_MONEY_HIGH = 3000; // 💰 вище — з'являються телевізор і вазон

// Предмети. Якір — НИЗ ПО ЦЕНТРУ (предмет «стоїть» у точці x,y, як персонажі).
// when: { stat, gte } або { stat, lte } — коли предмет видно.
// front: true → малюється ПОВЕРХ персонажів і оклюдерів (напр. листки на столі).
// scale — множник розміру спрайта (крутиться колесом у редакторі).
// Координати — прикидка, розставляє Даша в #props-geo.
const PROPS = [
  // --- КУПЛЕНІ предмети (шопінг «побалувати себе», data/shopping.js) ---
  // з'являються, коли гравець їх КУПИВ (flags.bought[id]); координати — заглушки,
  // розстав у #props-geo
  { id: 'hookah',        label: 'кальян',                 x: 110,  y: 905, scale: 0.56,
    when: { bought: true }, front: true },
  { id: 'brand_jacket',  label: 'брендова куртка',        x: 1183, y: 442, scale: 0.56,
    when: { bought: true } },
  { id: 'monitor_xbox',  label: 'монік + старий іксбокс', x: 835, y: 947, scale: 1,
    when: { bought: true }, front: true }, // поверх усього — і персонажів, і крісла
  { id: 'monstera',      label: 'вазон монстера',         x: 1629, y: 907, scale: 1,
    when: { bought: true }, front: true }, // рослина на підлозі/підвіконні
  { id: 'printer',       label: 'принтер (мікробізнес)',  x: 1177,  y: 856, scale: 0.56,
    when: { bought: true }, front: true }, // поверх стола, щоб стіл не перекривав

  // --- 💰 низькі: кімната біднішає ---
  { id: 'mivina',  label: 'гора пачок мівіни',    x: 700,  y: 716, scale: 1,
    when: { stat: 'money', lte: PROP_MONEY_LOW } },
  { id: 'boxes',   label: 'порожні коробки',      x: 249,  y: 923, scale: 1,
    when: { stat: 'money', lte: PROP_MONEY_LOW } },
  { id: 'trash',   label: 'пляшки і папірці',     x: 1010, y: 880, scale: 1,
    when: { stat: 'money', lte: PROP_MONEY_LOW } },

  // --- 📚 низька: конспекти живуть своїм життям ---
  { id: 'papers',  label: 'розкидані листки',     x: 1330, y: 640, scale: 1,
    when: { stat: 'study', lte: 30 }, front: true }, // на стільниці — поверх стола

  // --- 🧠 низька: одяг сам себе не складе ---
  { id: 'clothes', label: 'купа одягу на підлозі', x: 860, y: 884, scale: 1,
    when: { stat: 'mental', lte: 30 } },
];

const PROP_FADE_MS = 450; // плавна поява/зникнення, як у нічної накладки

const propsGeoMode = () => location.hash === '#props-geo';

// завантаження спрайтів (відсутній файл — не помилка)
for (const p of PROPS) {
  p.img = new Image();
  p.img.ready = false;
  p.img.onload = () => { p.img.ready = true; };
  p.img.onerror = () => { p.img.ready = false; };
  p.img.src = `assets/sprites/props/${p.id}.png`;
  p.alpha = 0; // проявляється фейдом, коли умова виконана
}

// чи виконана умова появи предмета
function propActive(p) {
  // у редакторі показуємо ВСЕ — щоб було що розставляти й налаштовувати
  // (інакше куплені предмети видно тільки після покупки в грі)
  if (propsGeoMode()) return true;
  // куплені предмети (шопінг) — показуються назавжди після покупки
  if (p.when.bought) return !!(gameState.flags.bought && gameState.flags.bought[p.id]);
  const v = gameState.stats[p.when.stat];
  if (p.when.gte !== undefined) return v >= p.when.gte;
  if (p.when.lte !== undefined) return v <= p.when.lte;
  return false;
}

// розміри предмета на сцені (для малювання і хіт-тесту в редакторі);
// без спрайта — рамка-заглушка 140×100
function propSize(p) {
  const w = p.img.ready ? p.img.width * p.scale : 140;
  const h = p.img.ready ? p.img.height * p.scale : 100;
  return { w, h };
}

// ---------- рендер (викликає scene.js) ----------
// layer: 'behind' — за персонажами (типово) | 'front' — поверх (front: true)
let propsLastTick = null;

function renderProps(ctx, layer, now) {
  // фейд рахуємо один раз на кадр — на шарі 'behind' (він завжди перший)
  if (layer === 'behind') {
    const dt = propsLastTick === null ? 16 : now - propsLastTick;
    propsLastTick = now;
    const step = dt / PROP_FADE_MS;
    for (const p of PROPS) {
      const target = propActive(p) ? 1 : 0;
      p.alpha += Math.sign(target - p.alpha) * Math.min(step, Math.abs(target - p.alpha));
    }
  }

  for (const p of PROPS) {
    if ((p.front ? 'front' : 'behind') !== layer) continue;
    if (!p.img.ready || p.alpha <= 0) continue;
    const { w, h } = propSize(p);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.drawImage(p.img, p.x - w / 2, p.y - h, w, h);
    ctx.restore();
  }
}

// ---------- редактор (#props-geo): тягни предмети, колесо = масштаб ----------

let propsGeoDrag = null; // {p, dx, dy} — який предмет тягнемо і зсув хвата

function propHitTest(p, x, y) {
  const { w, h } = propSize(p);
  return x >= p.x - w / 2 && x <= p.x + w / 2 && y >= p.y - h && y <= p.y;
}

window.addEventListener('mousedown', (e) => {
  if (!propsGeoMode()) return;
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  const pos = borisSceneCoords(e, canvas); // хелпер із boris.js
  // перебираємо з кінця: хто намальований пізніше, той «зверху» під курсором
  for (let i = PROPS.length - 1; i >= 0; i--) {
    const p = PROPS[i];
    if (propHitTest(p, pos.x, pos.y)) {
      propsGeoDrag = { p, dx: p.x - pos.x, dy: p.y - pos.y };
      return;
    }
  }
});
window.addEventListener('mousemove', (e) => {
  if (!propsGeoDrag) return;
  const canvas = document.getElementById('scene');
  const pos = borisSceneCoords(e, canvas);
  propsGeoDrag.p.x = pos.x + propsGeoDrag.dx;
  propsGeoDrag.p.y = pos.y + propsGeoDrag.dy;
});
window.addEventListener('mouseup', () => { propsGeoDrag = null; });

// колесо над предметом — масштаб ±5% за «клац»
window.addEventListener('wheel', (e) => {
  if (!propsGeoMode()) return;
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  const pos = borisSceneCoords(e, canvas);
  for (let i = PROPS.length - 1; i >= 0; i--) {
    const p = PROPS[i];
    if (propHitTest(p, pos.x, pos.y)) {
      p.scale = Math.max(0.1, p.scale * (e.deltaY < 0 ? 1.05 : 1 / 1.05));
      e.preventDefault();
      return;
    }
  }
}, { passive: false });

function renderPropsGeo(ctx) {
  if (!propsGeoMode()) return;
  ctx.save();
  ctx.font = '20px monospace';
  ctx.textAlign = 'left';

  let line = 0;
  for (const p of PROPS) {
    const active = propActive(p);
    const { w, h } = propSize(p);

    // сам предмет: активний — яскраво, неактивний — напівпрозоро
    if (p.img.ready) {
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.45;
      ctx.drawImage(p.img, p.x - w / 2, p.y - h, w, h);
      ctx.restore();
    } else {
      // спрайта ще нема — маджентова пунктирна рамка-заглушка
      ctx.save();
      ctx.strokeStyle = active ? 'rgba(255, 0, 255, 0.95)' : 'rgba(255, 0, 255, 0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 7]);
      ctx.strokeRect(p.x - w / 2, p.y - h, w, h);
      ctx.restore();
    }

    // ЗОНА КЛІКУ (для предметів з мінігрою) — зелена рамка.
    // Не збігається з рамкою спрайта навмисно: у спрайта багато прозорих
    // країв. Налаштування — hit у CLICKABLE_PROPS (js/minigames.js).
    if (typeof CLICKABLE_PROPS !== 'undefined' && CLICKABLE_PROPS[p.id]) {
      const r = clickableRect(p);
      ctx.save();
      ctx.strokeStyle = 'rgba(120, 230, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(120, 230, 120, 0.9)';
      ctx.fillText('зона кліку', r.x, r.y - 6);
      ctx.restore();
    }

    // точка-якір і підпис
    ctx.fillStyle = active ? 'rgba(120, 220, 120, 0.95)' : 'rgba(255, 70, 70, 0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(p.id, p.x + 12, p.y + 6);

    // список координат у кутку — спиши в js/props.js
    const cond = p.when.gte !== undefined
      ? `${p.when.stat} ≥ ${p.when.gte}` : `${p.when.stat} ≤ ${p.when.lte}`;
    ctx.fillStyle = active ? '#8ee08e' : '#ffd166';
    ctx.fillText(
      `${p.id}: x:${Math.round(p.x)}, y:${Math.round(p.y)}, scale:${p.scale.toFixed(2)}` +
      ` — ${cond}${p.img.ready ? '' : ' (нема спрайта)'}`,
      20, 60 + line * 26);
    line++;
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillText('Тягни предмети мишкою, колесо = масштаб; координати спиши у js/props.js.', 20, 30);
  ctx.fillText('Зелений якір = умова зараз виконана (чит-панель D міняє шкали наживо).', 20, 60 + line * 26 + 10);
  ctx.restore();
}
