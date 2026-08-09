// ============================================
// scene.js — рендер кімнати на Canvas
// Фон — ШІ-арт assets/sprites/room_base.png (480×270, нейтральне світло).
// Все живе світло (люстра, вечір, вимкнене світло) малює код поверх фону —
// правило з ART_DESIGN.md: світло НЕ запечене у спрайти.
// ============================================

// --- фонове зображення кімнати ---
const roomImg = new Image();
let roomImgReady = false;
roomImg.onload = () => { roomImgReady = true; };
roomImg.src = 'assets/sprites/room_base.png';

// Люстра на фоні висить приблизно тут (координати сцени 1672×941)
const CHANDELIER = { x: 843, y: 150 };

// Лінія підлоги — по ній ходитимуть персонажі (Етап 7)
const FLOOR_Y = 730;

function renderScene(ctx) {
  ctx.clearRect(0, 0, CONFIG.SCENE_WIDTH, CONFIG.SCENE_HEIGHT);

  if (!roomImgReady) {
    renderLoadingPlaceholder(ctx);
    return;
  }

  ctx.drawImage(roomImg, 0, 0);

  const now = performance.now();

  // предметні шари станів (props.js): бідність/багатство/занедбаність —
  // задній шар лягає ПІД персонажів (вони ходять перед предметами)
  renderProps(ctx, 'behind', now);

  // Шар мусору — ПІД персонажами (весь мотлох на задній план: герої ходять
  // поверх нього). Оновлює фейд.
  renderMess(ctx, now);

  // сліди невирішених форс-мажорів (калюжа, Wi-Fi ✕) — ПІД персонажами:
  // калюжа лежить на підлозі, герої стоять перед нею, ноги її не перекриває
  renderForceMajeureTraces(ctx, now);

  // мешканці кімнати — поверх фону, під шаром світла
  renderCharacters(ctx, now);
  renderOccluders(ctx); // столи — ПОВЕРХ персонажів: ноги ховаються за стільницею

  // предмети з front: true (листки на стільниці) — поверх столів
  renderProps(ctx, 'front', now);

  // Борис 🪳 — між фоном і шаром світла (щоб вечірній тінт лягав і на нього)
  updateBoris(now);
  renderBoris(ctx, now);

  renderLighting(ctx);

  // підказка «предмет можна натиснути» (монік з Xbox) — ПОВЕРХ світла,
  // щоб світіння й іконка читались навіть уночі
  if (typeof renderClickableHints === 'function') renderClickableHints(ctx, now);

  renderBorisGeo(ctx); // оверлей редактора геометрії (тільки при #boris-geo)
  renderPropsGeo(ctx); // оверлей редактора предметів (тільки при #props-geo)
}

// --- візуальні сліди форс-мажорів (Етап 9) ---
// Малюються, поки форс-мажор активний (не вирішений). Координати — пісочниця.
const FM_TRACE = {
  puddle: { x: 690, y: 838 },  // калюжа під батареєю (ліва частина підлоги)
  wifi:   { x: 1545, y: 250 }, // значок Wi-Fi ✕ біля роутера/вікна
};

function renderForceMajeureTraces(ctx, now) {
  if (typeof FORCE_MAJEURES === 'undefined' || typeof fmState !== 'function') return;
  const st = fmState();
  for (const fm of FORCE_MAJEURES) {
    if (!fm.trace || !st[fm.id] || !st[fm.id].active) continue;
    if (fm.trace === 'puddle') drawPuddle(ctx, now, FM_TRACE.puddle);
    else if (fm.trace === 'wifi') drawWifiOff(ctx, FM_TRACE.wifi);
  }
}

// калюжа: кілька напівпрозорих синюватих еліпсів + легкий «блиск», що коливається
function drawPuddle(ctx, now, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const wob = 1 + Math.sin(now * 0.001) * 0.03;
  ctx.scale(wob, 1);
  ctx.fillStyle = 'rgba(90, 130, 170, 0.38)';
  ctx.beginPath(); ctx.ellipse(0, 0, 120, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150, 190, 220, 0.30)';
  ctx.beginPath(); ctx.ellipse(-18, -6, 60, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(200, 225, 245, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 120, 34, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// значок «інтернету нема»: дуги Wi-Fi + червона перекреслювальна риска
function drawWifiOff(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = 'rgba(230, 230, 240, 0.85)';
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 20, i * 13, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(230, 230, 240, 0.85)';
  ctx.beginPath(); ctx.arc(0, 20, 4, 0, Math.PI * 2); ctx.fill();
  // червона риска — «вимкнено»
  ctx.strokeStyle = 'rgba(224, 90, 74, 0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-26, -12); ctx.lineTo(26, 30); ctx.stroke();
  ctx.restore();
}

// --- передні шари-оклюдери ---
// Прямокутні шматки ФОНУ, які перемальовуються поверх персонажів:
// коли персонаж сидить за столом чи проходить за ним, його ноги
// природно ховаються за стільницею. Координати видно в #chars-geo.
const OCCLUDERS = [
    { id: 'desk_player', x: 1209, y: 595, w: 392, h: 76 }, // стіл гравця (правий)
    { id: 'desk_player2', x: 1209, y: 667, w: 57, h: 146 }, // стіл гравця (низ ліво)
    { id: 'desk_player3', x: 1515, y: 667, w: 87, h: 146 }, // стіл гравця (низ право)

    { id: 'laptop', x: 1435, y: 554, w: 96, h: 46 }, // ноут

    { id: 'desk_botan', x: 29, y: 635, w: 203, h: 206 }, // стіл Ботана (лівий)

];

function renderOccluders(ctx) {
  if (!roomImgReady) return;
  for (const o of OCCLUDERS) {
    // шматок ЧИСТОГО фону поверх персонажа (ховає ноги за стільницею)
    ctx.drawImage(roomImg, o.x, o.y, o.w, o.h, o.x, o.y, o.w, o.h);
    // …і одразу той самий шматок МОТЛОХУ — щоб оклюдер ховав лише персонажа,
    // а сміття, що було в цій зоні, не затиралося чистим фоном
    if (overlayMess.ready && messAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = messAlpha;
      ctx.drawImage(overlayMess, o.x, o.y, o.w, o.h, o.x, o.y, o.w, o.h);
      ctx.restore();
    }
  }
  // Накладки з прозорістю: повнорозмірні PNG 1672×941, де все прозоре,
  // крім потрібних предметів (ріжуться в Photopea з room_base_source).
  // chairs.png — малюється ТІЛЬКИ ВНОЧІ (бортики ліжок/ковдри поверх сплячих);
  // always.png — малюється завжди (напр. спинки крісел). Файли необов'язкові.
  // Нічна накладка з'являється, коли ХОЧ ХТОСЬ із мешканців уже ліг спати
  // (не чекаємо, поки ляжуть усі — досить одного).
  const coveredAsleep = gameState.phase === 'night'
    && typeof CHARACTERS !== 'undefined'
    && CHARACTERS.some(c => c.state === 'sleep');
  if (overlayNight.ready && coveredAsleep) {
    if (!overlayNight.since) overlayNight.since = performance.now();
    ctx.save();
    ctx.globalAlpha = Math.min(1, (performance.now() - overlayNight.since) / 450);
    ctx.drawImage(overlayNight, 0, 0);
    ctx.restore();
  } else {
    overlayNight.since = null; // скинути фейд до наступної ночі
  }
  if (overlayAlways.ready) {
    ctx.drawImage(overlayAlways, 0, 0);
  }
}

// необов'язкові накладки (якщо файлу нема — просто не малюються)
function loadOverlay(src) {
  const img = new Image();
  img.ready = false;
  img.onload = () => { img.ready = true; };
  img.onerror = () => { img.ready = false; };
  img.src = src;
  return img;
}
const overlayNight = loadOverlay('assets/sprites/overlays/chairs.png');
const overlayAlways = loadOverlay('assets/sprites/overlays/always.png');

// --- шар мусору (стан «занедбана кімната») ---
// Повнорозмірний PNG 1672×941: пляшки, обгортки, одяг, плями на підлозі.
// З'являється плавним фейдом, коли 🧠 АБО ⚡ впали нижче порога (немає сил/бажання
// прибирати), і зникає, коли шкали відновлюються. Малюється ПІД персонажами
// (весь мотлох на задній план — герої ходять поверх нього).
const overlayMess = loadOverlay('assets/sprites/overlays/mess.png');
const MESS_MENTAL_MAX = 30;   // 🧠 ≤ цього — кімната засмічена (крути тут)
const MESS_ENERGY_MAX = 30;   // ⚡ ≤ цього — теж засмічена (нема сил прибрати)
const MESS_FADE_MS = 600;     // тривалість появи/зникнення мотлоху
let messAlpha = 0, messLastTick = null;
let messWasMessy = null;      // попередній стан (для сповіщення про перехід)

function renderMess(ctx, now) {
  if (!overlayMess.ready) return;
  // якщо сьогодні прибрали — кімната чиста весь день, попри низькі шкали
  const cleanedToday = gameState.flags.roomCleanedDay === gameState.day;
  const messy = !cleanedToday
             && (gameState.stats.mental <= MESS_MENTAL_MAX
              || gameState.stats.energy <= MESS_ENERGY_MAX);

  // сповіщення ОДИН раз при переході чисто→брудно (не спамимо щокадру);
  // перший кадр лише запам'ятовуємо стан — не сповіщаємо (щоб не блимало
  // одразу після завантаження вже брудної гри)
  if (messWasMessy === null) {
    messWasMessy = messy;
  } else if (messy && !messWasMessy) {
    const low = gameState.stats.energy <= MESS_ENERGY_MAX ? 'сил' : 'настрою';
    if (typeof showToast === 'function') {
      showToast(`🗑️ Кімната завалюється мотлохом — немає ${low} прибрати.`);
    }
    messWasMessy = true;
  } else {
    messWasMessy = messy;
  }

  const target = messy ? 1 : 0;
  const dt = messLastTick === null ? 16 : now - messLastTick;
  messLastTick = now;
  const step = dt / MESS_FADE_MS;
  messAlpha += Math.sign(target - messAlpha) * Math.min(step, Math.abs(target - messAlpha));
  if (messAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = messAlpha;
  ctx.drawImage(overlayMess, 0, 0);
  ctx.restore();
}

// --- шар світла (Етап 6: живе світло) ---
// База (room_base.png) навмисно рівно освітлена. Настрій робить код,
// і він залежить від ФАЗИ ДНЯ та МЕНТАЛОЧКИ:
//   ранок/день — природне світло з вікна, люстра вимкнена
//   вечір      — тепла люстра
//   ніч        — темрява + холодне місячне світло з вікна
//   🧠 < 30    — все тьмяніє і холоднішає, віньєтка густіша
//   🧠 ≥ 70    — ледь тепліше (затишок)
function renderLighting(ctx) {
  const W = CONFIG.SCENE_WIDTH, H = CONFIG.SCENE_HEIGHT;
  const phase = gameState.phase;
  const mental = gameState.stats.mental;

  if (phase === 'night') {
    // ніч: кімната тоне в темряві, місяць світить з вікна праворуч
    ctx.fillStyle = 'rgba(8, 10, 34, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 1555, 330, 300, 'rgba(140, 170, 255, 0.22)');  // місяць у вікні
    glow(ctx, 1300, 750, 520, 'rgba(120, 150, 255, 0.08)');  // відблиск на підлозі
    ctx.globalCompositeOperation = 'source-over';
  } else if (phase === 'evening') {
    // вечір: тепле світло люстри
    ctx.fillStyle = 'rgba(28, 20, 48, 0.18)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, CHANDELIER.x, CHANDELIER.y, 315, 'rgba(255, 214, 140, 0.22)');
    glow(ctx, CHANDELIER.x, CHANDELIER.y + 105, 905, 'rgba(255, 205, 120, 0.14)');
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // ранок/день: природне світло від вікна, вранці — тепліше
    const warmth = phase === 'morning' ? 0.16 : 0.10;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 1550, 320, 460, `rgba(255, 240, 210, ${warmth})`);
    ctx.globalCompositeOperation = 'source-over';
  }

  // менталочка керує настроєм світла
  if (mental < 30) {
    const gloom = 0.16 + (30 - mental) / 30 * 0.10; // чим нижче, тим темніше
    ctx.fillStyle = `rgba(30, 34, 58, ${gloom})`;
    ctx.fillRect(0, 0, W, H);
  } else if (mental >= 70 && phase !== 'night') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 214, 150, 0.05)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // віньєтка: при низькій менталочці кути тонуть глибше
  const vignetteStrength = mental < 30 ? 0.52 : 0.38;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(1, `rgba(16, 10, 34, ${vignetteStrength})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// м'яка радіальна пляма світла
function glow(ctx, x, y, radius, color) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// поки картинка вантажиться — темний екран з написом
function renderLoadingPlaceholder(ctx) {
  ctx.fillStyle = '#14121a';
  ctx.fillRect(0, 0, CONFIG.SCENE_WIDTH, CONFIG.SCENE_HEIGHT);
  ctx.fillStyle = '#9a8fb0';
  ctx.font = '34px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Завантаження кімнати…', CONFIG.SCENE_WIDTH / 2, CONFIG.SCENE_HEIGHT / 2);
}
