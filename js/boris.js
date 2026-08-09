// ============================================
// boris.js — Борис 🪳, тарган-резидент «Одинадцятки»
//
// Поведінка:
//  - вилазить З-ЗА меблів і ховається ЗА меблі: у кожного укриття є
//    прямокутник-«маска» (cover) — частина тіла всередині маски не
//    малюється, тому Борис ПОСТУПОВО заповзає за предмет (вуса зникають
//    останніми), а не розчиняється в повітрі;
//  - повертає ПЛАВНО (кут згладжується, а не стрибає);
//  - два стани залежно від поверхні: на стіні його видно ЗВЕРХУ
//    (панцир, лапки з боків), на стелі — ЗБОКУ В ПРОФІЛЬ (висить
//    догори лапками);
//  - іноді зупиняється посеред маршруту і ворушить вусами;
//  - на фінальному відрізку — тарганячий ривок до укриття.
//
// Тест: index.html#boris — з'являється одразу, зони чергуються по колу.
//       index.html#boris-1 — тільки конкретна зона (0 стіна з постерами,
//       1 стеля, 2 стіна біля ліжка, 3 підлога).
//       index.html#boris-geo — РЕДАКТОР ГЕОМЕТРІЇ: показує зони (зелені),
//       маски укриттів (сині), точки входу/виходу (червоні) прямо поверх
//       кімнати, а біля курсора — координати сцени. Наведи мишку на
//       потрібне місце, спиши числа і встав їх у BORIS_AREAS нижче.
// ============================================

// Ділянки (координати сцени 1672×941).
// surface: 'wall' (бачимо зверху) | 'ceiling' (бачимо в профіль).
// hideouts: точка на краю меблів + cover — прямокутник самих меблів (маска).
const BORIS_AREAS = [
  // ⚠️ Укриття — ТІЛЬКИ реальні предмети (постер, люстра, штора, меблі).
  // «Сховатись за кут стіни» у виді збоку неможливо — такі точки видалені,
  // бо тарган обрізався невидимою лінією посеред стіни.
  // Ліва бокова стіна (x < ~190) — заборонена зона: вона в перспективі,
    // і вид «зверху» там виглядає неприродно.

  { // смуга задньої стіни над постерами двоярусного ліжка
    surface: 'wall',
    zone: { x: 272, y: 98, w: 390, h: 36 },
    hideouts: [
      { x: 333,  y: 126, cover: { x: 299,  y: 128, w: 91, h: 115 }, label: 'постер ROCK' },
      { x: 398,  y: 152, cover: { x: 403,  y: 155, w: 95,  h: 126  }, label: 'постер FESTIVAL' },
      { x: 578,  y: 154, cover: { x: 585,  y: 142, w: 91,  h: 117 }, label: 'постер ACBC' },
    ],
  },
  { // стеля — траса між люстрою і карнизом штор (профіль, догори лапками)
    surface: 'ceiling',
    zone: { x: 280, y: 44, w: 1100, h: 14 },
    hideouts: [
      { x: 843,  y: 95, cover: { x: 788,  y: 82, w: 112, h: 86  }, label: 'люстра' },
      { x: 1666, y: -10, cover: { x: 1634, y: -7, w: 130, h: 36  }, label: 'карниз штори' },
    ],
  },
  { // стіна між картою і узголів’ям ліжка гравця
    surface: 'wall',
      zone: { x: 1001, y: 349, w: 154, h: 187 },

    hideouts: [
      { x: 1101, y: 327, cover: { x: 921,  y: 262, w: 199,  h: 77 }, label: 'полиця' },
      { x: 1251, y: 518, cover: { x: 1252, y: 499, w: 95, h: 130 }, label: 'узголів’я' },
      { x: 1051, y: 545, cover: { x: 999, y: 547, w: 321, h: 130 }, label: 'ліжко' },
      { x: 1205, y: 422, cover: { x: 1165, y: 299, w: 222, h: 126 }, label: 'куртки' },
    ],
  },
  { // підлога — з-під двоярусного ліжка через кімнату до правого краю
    surface: 'floor',
    zone: { x: 370, y: 851, w: 1280, h: 90 },
    hideouts: [
      { x: 711,  y: 694, cover: { x: 325,  y: 556, w: 388, h: 150 }, label: 'під двоярусним ліжком' },
      { x: 1666, y: 870, cover: { x: 1660, y: 780, w: 90,  h: 161 }, label: 'правий край кімнати' },
    ],
  },
];

const BORIS = {
  state: 'hidden',        // 'hidden' | 'crawl' | 'pause' | 'falling' | 'dead'
  surface: 'wall',
  nextSpawnAt: null,
  path: [], seg: 0,
  from: null, to: null,
  segStartAt: 0, segDur: 0,
  entryCover: null, exitCover: null,
  x: 0, y: 0,
  angle: 0, targetAngle: 0, // плавний поворот: angle тягнеться до targetAngle
  facing: 1,                // для профілю на стелі: 1 → праворуч, -1 → ліворуч
  pauseUntil: 0,
  legPhase: 0,              // лапки дригаються тільки в русі
  // фізика смерті від тапка 🩴
  vy: 0, fallDrift: 0, spin: 0, landY: 0, deadUntil: 0,
  SPEED: 70,
  DASH: 2.6,
  _testAreaIdx: 0,
};

// #boris-run — це МІНІГРА (js/minigames.js), а не тест таргана в кімнаті
const borisTestMode = () => location.hash.startsWith('#boris') && location.hash !== '#boris-run';
// #boris-N → зафіксувати зону N
const borisForcedArea = () => {
  const m = location.hash.match(/^#boris-(\d)/);
  return m ? parseInt(m[1], 10) % BORIS_AREAS.length : null;
};
// #boris-geo → редактор геометрії
const borisGeoMode = () => location.hash === '#boris-geo';

// переклад позиції мишки у координати сцени
function borisSceneCoords(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.round((e.clientX - r.left) / r.width * CONFIG.SCENE_WIDTH),
    y: Math.round((e.clientY - r.top) / r.height * CONFIG.SCENE_HEIGHT),
  };
}

// чи влучає точка сцени в Бориса (радіус з запасом — він маленький і швидкий)
function borisHitTest(x, y) {
  if (BORIS.state !== 'crawl' && BORIS.state !== 'pause') return false;
  return Math.hypot(x - BORIS.x, y - BORIS.y) < 45;
}

// координати мишки (для редактора геометрії) + курсор-приціл над Борисом
let borisMouse = null;
window.addEventListener('mousemove', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const pos = borisSceneCoords(e, canvas);
  if (borisGeoMode()) borisMouse = pos;
  if (e.target === canvas) {
    canvas.style.cursor = borisHitTest(pos.x, pos.y) ? 'pointer' : 'default';
  }
});

// клік по Борису = тапок 🩴
window.addEventListener('click', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  const pos = borisSceneCoords(e, canvas);
  if (borisHitTest(pos.x, pos.y)) killBoris(performance.now());
});

// смерть від тапка: зі стіни/стелі — падає на підлогу, на підлозі — вмирає на місці
function killBoris(now) {
  if (gameState.counters) {
    gameState.counters.borisKilled = (gameState.counters.borisKilled || 0) + 1;
  }
  if (BORIS.surface === 'floor') {
    BORIS.state = 'dead';
    BORIS.deadUntil = now + 1800;
  } else {
    BORIS.state = 'falling';
    BORIS.vy = -3;                           // легкий «підкид» від удару
    BORIS.fallDrift = borisRand(-1.2, 1.2);  // трохи вбік
    BORIS.spin = BORIS.angle;
    BORIS.landY = borisRand(840, 900);       // куди гепнеться на підлозі
  }
}

function borisRand(min, max) { return min + Math.random() * (max - min); }

// Етап 6: при низькій менталочці Борис зачастив (кімната «занедбана»)
function borisMentalFactor() {
  try {
    return gameState.stats.mental < 30 ? 0.4 : 1;
  } catch (e) { return 1; }
}

// точка «в глибині» укриття: середина між краєм меблів і центром маски —
// туди Борис доповзає вже невидимим
function borisInsidePoint(h) {
  const cx = h.cover.x + h.cover.w / 2;
  const cy = h.cover.y + h.cover.h / 2;
  return { x: (h.x + cx) / 2, y: (h.y + cy) / 2 };
}

function borisSpawn(now) {
  let area;
  const forced = borisForcedArea();
  if (forced !== null) {
    area = BORIS_AREAS[forced];
  } else if (borisTestMode()) {
    area = BORIS_AREAS[BORIS._testAreaIdx++ % BORIS_AREAS.length]; // зони по колу
  } else {
    area = BORIS_AREAS[Math.floor(Math.random() * BORIS_AREAS.length)];
  }
  const z = area.zone;
  const randomPoint = () => ({ x: borisRand(z.x, z.x + z.w), y: borisRand(z.y, z.y + z.h) });

  const entry = area.hideouts[Math.floor(Math.random() * area.hideouts.length)];
  let exit = entry;
  if (area.hideouts.length > 1) {
    do { exit = area.hideouts[Math.floor(Math.random() * area.hideouts.length)]; }
    while (exit === entry);
  }

  // маршрут: з глибини укриття → прогулянка зоною → у глибину іншого укриття
  BORIS.path = [borisInsidePoint(entry), randomPoint()];
  if (Math.random() < 0.6) BORIS.path.push(randomPoint());
  BORIS.path.push(borisInsidePoint(exit));

  BORIS.surface = area.surface;
  BORIS.entryCover = entry.cover;
  BORIS.exitCover = exit.cover;
  BORIS.seg = 0;
  BORIS.state = 'crawl';
  // лічильник «скільки разів бачив Бориса» для фінальної статистики
  if (!borisTestMode() && gameState.counters) gameState.counters.boris++;
  borisStartSegment(now);
  BORIS.angle = BORIS.targetAngle; // на старті дивимось одразу куди повземо
}

function borisStartSegment(now) {
  BORIS.from = BORIS.path[BORIS.seg];
  BORIS.to = BORIS.path[BORIS.seg + 1];
  const isDashToCover = BORIS.seg === BORIS.path.length - 2;
  const speed = BORIS.SPEED * (isDashToCover ? BORIS.DASH : 1);
  const dist = Math.hypot(BORIS.to.x - BORIS.from.x, BORIS.to.y - BORIS.from.y);
  BORIS.segDur = Math.max(400, dist / speed * 1000);
  BORIS.segStartAt = now;
  BORIS.targetAngle = Math.atan2(BORIS.to.y - BORIS.from.y, BORIS.to.x - BORIS.from.x);
  if (Math.abs(BORIS.to.x - BORIS.from.x) > 4) BORIS.facing = BORIS.to.x > BORIS.from.x ? 1 : -1;
}

// найкоротша різниця кутів (щоб не крутився на 350° замість 10°)
function borisAngleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function updateBoris(now) {
  if (BORIS.nextSpawnAt === null) {
    BORIS.nextSpawnAt = now + (borisTestMode() ? 300 : borisRand(6000, 15000));
  }

  if (BORIS.state === 'hidden') {
    if (now >= BORIS.nextSpawnAt) borisSpawn(now);
    return;
  }

  // збитий тапком: летить донизу, обертаючись
  if (BORIS.state === 'falling') {
    BORIS.vy += 0.55;          // гравітація
    BORIS.y += BORIS.vy;
    BORIS.x += BORIS.fallDrift;
    BORIS.spin += 0.25;        // перекидається в польоті
    if (BORIS.y >= BORIS.landY) {
      BORIS.y = BORIS.landY;
      BORIS.state = 'dead';
      BORIS.deadUntil = now + 1800;
    }
    return;
  }

  // лежить лапками догори, подригається і зникає
  if (BORIS.state === 'dead') {
    if (now >= BORIS.deadUntil) {
      BORIS.state = 'hidden';
      BORIS.nextSpawnAt = now + (borisTestMode() ? 1200 : borisRand(25000, 70000) * borisMentalFactor());
    }
    return;
  }

  // тест #boris-dead: автоматично «прибити» через мить після появи
  if (location.hash === '#boris-dead' && !BORIS._testKilled && now > BORIS.segStartAt + 600) {
    BORIS._testKilled = true;
    killBoris(now);
    return;
  }

  if (BORIS.state === 'pause') {
    if (now >= BORIS.pauseUntil) {
      BORIS.state = 'crawl';
      borisStartSegment(now);
    }
    return; // стоїть, тільки вуса ворушаться (див. render)
  }

  // плавний доворот у бік руху
  BORIS.angle += borisAngleDiff(BORIS.angle, BORIS.targetAngle) * 0.12;
  // лапки дригаються тільки коли повзе
  BORIS.legPhase += 0.55;

  // Рух уздовж маршруту. Якщо кадри рідкі (вкладка була у фоні, браузер
  // «заснув») — могло минути одразу кілька відрізків, тож наздоганяємо їх
  // у циклі, а не стрибаємо в нікуди.
  let t = (now - BORIS.segStartAt) / BORIS.segDur;
  while (t >= 1) {
    const leftover = now - BORIS.segStartAt - BORIS.segDur; // час понад відрізок
    BORIS.seg++;
    if (BORIS.seg >= BORIS.path.length - 1) {
      // доповз у глибину укриття (вже повністю за маскою) — зник
      BORIS.state = 'hidden';
      BORIS.nextSpawnAt = now + (borisTestMode() ? 800 : borisRand(25000, 70000) * borisMentalFactor());
      return;
    }
    if (BORIS.seg < BORIS.path.length - 2 && Math.random() < 0.45) {
      // посеред прогулянки: замер на точці маршруту, ворушить вусами
      BORIS.state = 'pause';
      BORIS.pauseUntil = now + borisRand(500, 1600);
      BORIS.x = BORIS.path[BORIS.seg].x;
      BORIS.y = BORIS.path[BORIS.seg].y;
      return;
    }
    borisStartSegment(now - leftover); // новий відрізок стартує з урахуванням надлишку
    t = (now - BORIS.segStartAt) / BORIS.segDur;
  }

  // позиція + «перевалювання» перпендикулярно руху (на стелі — легше)
  const fx = BORIS.from.x, fy = BORIS.from.y;
  const dx = BORIS.to.x - fx, dy = BORIS.to.y - fy;
  const dist = Math.hypot(dx, dy) || 1;
  const waddle = Math.sin(now * 0.02) * (BORIS.surface === 'ceiling' ? 1.2 : 2.5);
  BORIS.x = fx + dx * t + (-dy / dist) * waddle;
  BORIS.y = fy + dy * t + (dx / dist) * waddle;
}

function renderBoris(ctx, now) {
  // у тест-режимі — рядок стану вгорі сцени (для налагодження)
  if (borisTestMode()) {
    ctx.save();
    ctx.font = '22px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(
      `BORIS: ${BORIS.state} seg=${BORIS.seg} x=${Math.round(BORIS.x)} y=${Math.round(BORIS.y)}`,
      20, 30
    );
    ctx.restore();
  }

  if (BORIS.state === 'hidden') return;

  ctx.save();

  // збитий: летить перекидаючись / лежить лапками догори і дригається
  if (BORIS.state === 'falling' || BORIS.state === 'dead') {
    const antennaPhase = now * 0.02;
    ctx.translate(BORIS.x, BORIS.y);
    if (BORIS.state === 'falling') {
      ctx.rotate(BORIS.spin);
      borisDrawCeilingProfile(ctx, BORIS.legPhase, antennaPhase, true);
    } else {
      // мертва поза = профіль лапками догори; перші ~0.6 с ще дригається
      const twitching = BORIS.deadUntil - now > 1200;
      if (twitching) BORIS.legPhase += 0.4;
      borisDrawCeilingProfile(ctx, BORIS.legPhase, antennaPhase, !twitching);
    }
    ctx.restore();
    return;
  }

  // Маска укриття: на першому відрізку ховає тіло, що ще «за» меблями входу,
  // на останньому — те, що вже заповзло за меблі виходу.
  // Прямокутник маски вирізається з області малювання (правило evenodd).
  const cover =
    BORIS.seg === 0 ? BORIS.entryCover :
    BORIS.seg >= BORIS.path.length - 2 ? BORIS.exitCover : null;
  if (cover) {
    const clip = new Path2D();
    clip.rect(0, 0, CONFIG.SCENE_WIDTH, CONFIG.SCENE_HEIGHT);
    clip.rect(cover.x, cover.y, cover.w, cover.h);
    ctx.clip(clip, 'evenodd');
  }

  const antennaPhase = now * 0.02;          // вуса ворушаться завжди
  const legs = BORIS.legPhase;              // лапки — тільки в русі

  ctx.translate(BORIS.x, BORIS.y);
  if (BORIS.surface === 'wall') {
    ctx.rotate(BORIS.angle);
    // на стіні тарган трохи менший: стіна «далі» від глядача,
    // ніж стеля і підлога на передньому плані
    ctx.scale(0.72, 0.72);
    borisDrawTopView(ctx, legs, antennaPhase, BORIS.state === 'pause');
  } else if (BORIS.surface === 'ceiling') {
    ctx.scale(BORIS.facing, 1);             // профіль: дивиться в бік руху
    borisDrawCeilingProfile(ctx, legs, antennaPhase, BORIS.state === 'pause');
  } else {
    // підлога: той самий профіль, віддзеркалений по вертикалі —
    // лапки вниз до підлоги, вуса вгору-вперед
    ctx.scale(BORIS.facing, -1);
    borisDrawCeilingProfile(ctx, legs, antennaPhase, BORIS.state === 'pause');
  }

  ctx.restore();
}

// --- вигляд ЗВЕРХУ (стіна): панцир, лапки з боків, вуса вперед ---
function borisDrawTopView(ctx, legs, antennaPhase, paused) {
  // лапки: 3 пари; у паузі — підібгані й нерухомі
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const wig = paused ? 0 : Math.sin(legs + i * 2.1) * 3;
    const reach = paused ? 9 : 12;
    ctx.beginPath();
    ctx.moveTo(i * 8, -5); ctx.lineTo(i * 8 + wig, -reach);
    ctx.moveTo(i * 8, 5);  ctx.lineTo(i * 8 - wig, reach);
    ctx.stroke();
  }

  // тіло-панцир
  ctx.fillStyle = '#2e1c10';
  ctx.strokeStyle = '#1a0f07';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // відблиск і лінія крил уздовж спинки
  ctx.fillStyle = 'rgba(96, 62, 34, 0.65)';
  ctx.beginPath();
  ctx.ellipse(-3, -2.5, 7, 2.5, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a0f07';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, 0); ctx.lineTo(9, 0);
  ctx.stroke();

  // голова
  ctx.fillStyle = '#241509';
  ctx.beginPath();
  ctx.ellipse(13, 0, 5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // вуса (у паузі «сканують» активніше)
  const sway = Math.sin(antennaPhase * (paused ? 1.6 : 0.7)) * (paused ? 5 : 3);
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, -2);
  ctx.quadraticCurveTo(26, -7 + sway, 33, -10 + sway);
  ctx.moveTo(16, 2);
  ctx.quadraticCurveTo(26, 7 - sway, 33, 10 - sway);
  ctx.stroke();
}

// --- профіль на СТЕЛІ: висить догори лапками, тіло під стелею ---
function borisDrawCeilingProfile(ctx, legs, antennaPhase, paused) {
  // стеля умовно на y = -6 (лапки чіпляються за неї)

  // лапки: 3 зігнуті ніжки вгору до стелі
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    const step = paused ? 0 : Math.sin(legs + i * 2.1) * 3;
    ctx.beginPath();
    ctx.moveTo(i * 7, 1);                       // від тіла
    ctx.lineTo(i * 7 + 3 + step, -6);           // коліном угору до стелі
    ctx.stroke();
  }

  // тіло у профіль (пласкіше, висить під стелею)
  ctx.fillStyle = '#2e1c10';
  ctx.strokeStyle = '#1a0f07';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 3, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // черевце-смужка (він же догори ногами — бачимо низ)
  ctx.strokeStyle = 'rgba(96, 62, 34, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, 6); ctx.lineTo(8, 6);
  ctx.stroke();

  // голова спереду, трохи нижче (звисає)
  ctx.fillStyle = '#241509';
  ctx.beginPath();
  ctx.ellipse(13, 4, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // вуса вперед і вниз (гравітація!)
  const sway = Math.sin(antennaPhase * (paused ? 1.6 : 0.7)) * (paused ? 4 : 2.5);
  ctx.strokeStyle = '#1d1208';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(16, 3);
  ctx.quadraticCurveTo(25, 8 + sway, 31, 14 + sway);
  ctx.moveTo(16, 5);
  ctx.quadraticCurveTo(24, 12 - sway, 29, 18 - sway);
  ctx.stroke();
}

// --- редактор геометрії (#boris-geo): зони, маски, точки, координати ---
function renderBorisGeo(ctx) {
  if (!borisGeoMode()) return;

  ctx.save();
  ctx.font = '20px monospace';
  ctx.textAlign = 'left';

  for (const area of BORIS_AREAS) {
    // зона прогулянок — зелена рамка
    ctx.strokeStyle = 'rgba(80, 255, 120, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(area.zone.x, area.zone.y, area.zone.w, area.zone.h);

    for (const h of area.hideouts) {
      // маска укриття — синя напівпрозора
      ctx.fillStyle = 'rgba(80, 160, 255, 0.25)';
      ctx.strokeStyle = 'rgba(80, 160, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.fillRect(h.cover.x, h.cover.y, h.cover.w, h.cover.h);
      ctx.strokeRect(h.cover.x, h.cover.y, h.cover.w, h.cover.h);

      // точка входу/виходу — червона, з підписом
      ctx.fillStyle = 'rgba(255, 70, 70, 0.95)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(h.label, h.x + 12, h.y + 6);
    }
  }

  // координати сцени біля курсора
  if (borisMouse) {
    const txt = `x: ${borisMouse.x}  y: ${borisMouse.y}`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(borisMouse.x + 14, borisMouse.y - 30, txt.length * 12 + 12, 30);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(txt, borisMouse.x + 20, borisMouse.y - 8);
    // перехрестя
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(borisMouse.x - 20, borisMouse.y); ctx.lineTo(borisMouse.x + 20, borisMouse.y);
    ctx.moveTo(borisMouse.x, borisMouse.y - 20); ctx.lineTo(borisMouse.x, borisMouse.y + 20);
    ctx.stroke();
  }

  ctx.restore();
}
