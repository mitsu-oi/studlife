// ============================================
// characters.js — мешканці кімнати з рутинами (Етап 7)
//
// Кожен персонаж живе своїм життям: посидів за справою → встав →
// пройшовся кімнатою (поза «іде», розворот у бік руху, крок-підстрибування) →
// зайнявся наступною справою. Тусовщик на верхній ярус «залазить» біля
// драбини (короткий фейд — ніби виліз за кадром).
//
// Спрайт-листи: assets/sprites/characters/*.png — ряд 4 комірок 280×320,
// запечені одразу в ігровий розмір (див. tools/process_chars.html).
// Пози: 0 стоїть · 1 іде · 2 своя справа · 3 інше (у кожного своє).
//
// Редактор місць: index.html#chars-geo — тягни точки мишкою,
// координати показуються на екрані, спиши їх у spots нижче.
// ============================================

const CHAR_CELL = { w: 300, h: 344 };
const CHAR_SPEED = 110;   // швидкість ходьби, px/сек
const CLIMB_MS = 350;     // тривалість фейду «лізе по драбині»

// Персонажі, їхні місця (координати сцени 1672×941, якір = низ по центру)
// і справи: pose — яку позу грати на місці, dwell — скільки сидіти (сек).
const CHARACTERS = [
  {
    id: 'botan',
    // спрайт-лист: 0-3 базові · 4-7 хода · 8-9 читає · 10 нотує · 11-13 пише сидячи
    sheet: 'assets/sprites/characters/botan.png',
    breathPhase: 0, shadow: 58,
    walkFrames: [4, 5, 6, 7], // справжній 4-кадровий крок
    spots: [
      // flip: true → віддзеркалити (стіл Ботана ЛІВОРУЧ від крісла)
      { id: 'desk',  x: 297,  y: 776, pose: 12,
        dwell: [5, 9], flip: true }, // пише конспект сидячи (одна поза)
      { id: 'shelf', x: 300,  y: 842, pose: 0, frames: [8, 9], frameMs: 700,
        dwell: [4, 7] },  // читає біля полиць
      { id: 'think', x: 571,  y: 851, pose: 10,
        dwell: [3, 5] },  // стоїть і нотує в блокноті (одна поза)
    ],
    // сон: нижній ярус двоярусного. Стояча поза 3, повернута на бік (головою
    // вліво, до подушки). x,y — ЦЕНТР тіла на матраці, bedside — звідки лягає
        sleep: { x: 410, y: 540, pose: 3, rot: -Math.PI / 2, bedside: { x: 481, y: 719 } },
  },
  {
    id: 'player',
    // спрайт-лист: 0-3 базові · 4-8 хода (5 кадрів, аркуш main.move.char.png)
    sheet: 'assets/sprites/characters/main.png',
    breathPhase: 2.1, shadow: 58,
    // порядок = правильний цикл кроку. Час іде ВПЕРЕД: опорна (передня) нога
    // плавно від'їжджає назад під тілом — інакше «місячна хода».
    // Передня ступня по кадрах (x): 7→193, 6→171, 8→171, 4→145 — рівно назад,
    // потім 5 (нога-мах приземляється спереду) і цикл замикається:
    // 7 контакт (широкий крок) → 6 відрив задньої → 8 пронос махової →
    // 4 пронос під тілом → 5 приземлення спереду → знову 7
    walkFrames: [7, 6, 8, 4, 5],
    stepPx: 29, // 5 кадрів на цикл: 144 px циклу / 5 (у 4-кадрових — 36)
    spots: [
      { id: 'desk',   x: 1348, y: 752, pose: 2, dwell: [5, 9] },  // кодить
      { id: 'window', x: 1492, y: 737, pose: 0, dwell: [4, 7] },  // дивиться у вікно
      { id: 'fridge', x: 771,  y: 725, pose: 0, dwell: [3, 5] },  // ревізія холодильника
    ],
    // сон: власне ліжко праворуч, головою до подушки (до вікна)
    sleep: { x: 1289, y: 554, pose: 3, rot: Math.PI / 2, bedside: { x: 1120, y: 731 } },
  },
  {
    id: 'party',
    // спрайт-лист: 0-3 базові · 4-7 хода · 8-9 гітара · 10-11 телефон
    sheet: 'assets/sprites/characters/party.png',
    breathPhase: 4.2, shadow: 64,
    walkFrames: [4, 5, 6, 7],
    ladder: { x: 640, y: 850 },  // точка біля драбини — звідси лізе на ярус
    spots: [
      // frames + frameMs: анімація на місці (рука ходить по струнах).
      // lockLegsY: нижче цієї лінії комірки завжди малюється ПЕРШИЙ кадр —
      // ноги не «смикаються», якщо генератор намалював їх трохи різними
      { id: 'bunk',   x: 471,  y: 351, pose: 2, frames: [8, 9], frameMs: 320,
        lockLegsY: 262, dwell: [7, 12], viaLadder: true },
      { id: 'phone',  x: 1015, y: 850, pose: 0, frames: [10, 12], frameMs: 600,
        dwell: [4, 7] },  // гортає телефон (кадр 11 з повернутою головою — забракований)
      { id: 'wander', x: 790,  y: 855, pose: 0, dwell: [3, 5] }, // тиняється
    ],
    // сон: верхній ярус, його лежача поза (3) як є, головою до подушки (вліво)
    sleep: { x: 391, y: 256, pose: 3, rot: 0, flip: true, viaLadder: true },
  },
];

const charsGeoMode = () => location.hash === '#chars-geo';

// службове полотно для складання кадру з «замороженими» ногами:
// на головному канвасі стерти шматок не можна (там кімната позаду),
// а тут — можна, і вже готовий результат їде в кімнату
const charScratch = document.createElement('canvas');
charScratch.width = CHAR_CELL.w;
charScratch.height = CHAR_CELL.h;
const charScratchCtx = charScratch.getContext('2d');

function charRand(min, max) { return min + Math.random() * (max - min); }

// ---------- емоційна реакція на форс-мажор (Етап 9) ----------
// Поки форс-мажор активний — мешканці реагують (тремтять/зляться + бульбашка
// над головою). Після вирішення реакція ще триває EMOTION_REACTION_MS, щоб
// гравець точно її побачив. Тип емоції задає data/force_majeure.js.
let fmReactUntil = 0;
let fmReactEmotion = null;
const EMOTION_REACTION_MS = 5000;
const EMOTION_EMOJI = { scared: '😱', angry: '😠', nervous: '😰', sad: '😢' };

function noteForceMajeureReaction(emotion) {
  fmReactEmotion = emotion;
  fmReactUntil = performance.now() + EMOTION_REACTION_MS;
}

// яка емоція зараз (активний форс-мажор має пріоритет; інакше — залишкова реакція)
function currentFMEmotion(now) {
  if (typeof FORCE_MAJEURES !== 'undefined' && typeof fmState === 'function') {
    const st = fmState();
    for (const fm of FORCE_MAJEURES) {
      if (fm.emotion && st[fm.id] && st[fm.id].active) return fm.emotion;
    }
  }
  if (now < fmReactUntil) return fmReactEmotion;
  return null;
}

// бульбашка-емодзі над головою персонажа (з легким підстрибом)
function drawEmotion(ctx, ch, emotion, now) {
  const emoji = EMOTION_EMOJI[emotion] || '❗';
  const bob = Math.sin(now * 0.006 + ch.breathPhase) * 4;
  const y = Math.max(46, ch.y - 300 + bob);
  ctx.save();
  ctx.font = '46px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(emoji, ch.x, y);
  ctx.restore();
}

// завантаження спрайт-листів + стартовий стан: кожен на своєму першому місці
for (const ch of CHARACTERS) {
  ch.img = new Image();
  ch.img.ready = false;
  ch.img.onload = () => { ch.img.ready = true; };
  ch.img.src = ch.sheet;

  ch.state = 'idle';           // 'idle' | 'walk' | 'climb'
  ch.spot = ch.spots[0];
  ch.x = ch.spot.x; ch.y = ch.spot.y;
  ch.until = null;             // коли набридне поточна справа
  ch.facing = ch.spot.flip ? -1 : 1; // дзеркало діє і на стартовому місці
  ch.alpha = 1;                // для фейду на драбині
  ch.walk = null;              // {fromX, fromY, toX, toY, start, dur, target}
  ch.climb = null;             // {phase:'out'|'in', start, target}
}

// ---------- логіка життя ----------

function charStartWalk(ch, target, now) {
  // на ярус (або з нього) ходимо через точку біля драбини
  const from = { x: ch.x, y: ch.y };
  const leavingBunk = ch.spot && ch.spot.viaLadder;
  const to = target.viaLadder ? ch.ladder
           : leavingBunk ? { x: ch.ladder.x, y: ch.ladder.y }
           : { x: target.x, y: target.y };

  // якщо зараз сидить на ярусі — спершу «злазить» (фейд), потім іде
  if (leavingBunk) {
    ch.state = 'climb';
    ch.climb = { phase: 'down', start: now, target };
    return;
  }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  ch.state = 'walk';
  ch.walk = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
              start: now, dur: Math.max(300, dist / CHAR_SPEED * 1000), target };
  if (Math.abs(to.x - from.x) > 4) ch.facing = to.x > from.x ? 1 : -1;
}

function charArrive(ch, now) {
  const target = ch.walk.target;
  if (target.sleepTarget && !target.viaLadder) {
    // дійшов до ліжка — вкладається
    ch.state = 'sleep';
  } else if (target.viaLadder) {
    // дійшов до драбини — лізе нагору (фейд-зникнення внизу, поява на ярусі)
    ch.state = 'climb';
    ch.climb = { phase: 'up', start: now, target };
  } else {
    ch.state = 'idle';
    ch.spot = target;
    ch.x = target.x; ch.y = target.y;
    ch.until = now + charRand(...target.dwell) * 1000;
    ch.facing = target.flip ? -1 : 1; // пози намальовані вправо; flip — дзеркало
  }
  ch.walk = null;
}

function updateCharacter(ch, now) {
  if (charsGeoMode()) return; // у редакторі всі стоять на місцях

  const isNight = typeof gameState !== 'undefined' && gameState.phase === 'night';

  // ранок: прокидаємось (без анімації — гравець у цей час бачить календарик)
  if (!isNight && ch.state === 'sleep') {
    ch.state = 'idle';
    ch.spot = ch.spots.find(s => !s.viaLadder) || ch.spots[0];
    ch.x = ch.spot.x; ch.y = ch.spot.y;
    ch.facing = ch.spot.flip ? -1 : 1;
    ch.until = now + charRand(...ch.spot.dwell) * 1000;
    return;
  }

  if (ch.state === 'idle') {
    // ніч: час лягати
    if (isNight) {
      if (ch.spot && ch.spot.viaLadder && ch.sleep.viaLadder) {
        // Тусовщик уже на ярусі — просто вкладається
        ch.state = 'sleep';
        return;
      }
      // йдемо до ліжка (на ярус — через драбину)
      const target = ch.sleep.viaLadder
        ? { ...ch.sleep, sleepTarget: true }                     // через драбину
        : { ...ch.sleep.bedside, sleepTarget: true, dwell: [1, 1] };
      charStartWalk(ch, target, now);
      return;
    }
    if (ch.until === null) ch.until = now + charRand(...ch.spot.dwell) * 1000;
    if (now >= ch.until) {
      // обираємо іншу справу
      const others = ch.spots.filter(s => s !== ch.spot);
      const target = others[Math.floor(Math.random() * others.length)];
      charStartWalk(ch, target, now);
    }
    return;
  }

  if (ch.state === 'sleep') return; // спить собі

  if (ch.state === 'walk') {
    const t = Math.min(1, (now - ch.walk.start) / ch.walk.dur);
    // плавний розгін і гальмування (ease-in-out) — без ривків на старті/фініші
    const e = t * t * (3 - 2 * t);
    ch.x = ch.walk.fromX + (ch.walk.toX - ch.walk.fromX) * e;
    ch.y = ch.walk.fromY + (ch.walk.toY - ch.walk.fromY) * e;
    // пройдений шлях — для синхронізації кадрів кроку з рухом (ноги не ковзають)
    const dist = Math.hypot(ch.walk.toX - ch.walk.fromX, ch.walk.toY - ch.walk.fromY);
    ch.walkDist = dist * e;
    if (t >= 1) charArrive(ch, now);
    return;
  }

  if (ch.state === 'climb') {
    const t = Math.min(1, (now - ch.climb.start) / CLIMB_MS);
    if (ch.climb.phase === 'up') {
      ch.alpha = 1 - t;                       // тане біля драбини
      if (t >= 1) {
        const target = ch.climb.target;
        ch.spot = target;
        ch.x = target.x; ch.y = target.y;
        ch.climb = { phase: 'appear', start: now, target };
      }
    } else if (ch.climb.phase === 'appear') {
      ch.alpha = t;                           // проявляється на ярусі
      if (t >= 1) {
        ch.alpha = 1;
        if (ch.climb.target.sleepTarget) {
          ch.state = 'sleep';                 // виліз на ярус — і спати
        } else {
          ch.state = 'idle';
          ch.until = now + charRand(...ch.spot.dwell) * 1000;
        }
        ch.climb = null;
      }
    } else { // 'down' — злазить з яруса
      ch.alpha = 1 - t;
      if (t >= 1) {
        ch.x = ch.ladder.x; ch.y = ch.ladder.y;
        ch.spot = null;
        ch.alpha = 1;
        // і одразу йде до цілі
        const target = ch.climb.target;
        ch.climb = null;
        ch.state = 'walk';
        const dist = Math.hypot(target.x - ch.x, target.y - ch.y);
        ch.walk = { fromX: ch.x, fromY: ch.y, toX: target.x, toY: target.y,
                    start: now, dur: Math.max(300, dist / CHAR_SPEED * 1000), target };
        if (Math.abs(target.x - ch.x) > 4) ch.facing = target.x > ch.x ? 1 : -1;
      }
    }
  }
}

// ---------- малювання ----------

function renderCharacters(ctx, now) {
  ctx.save();

  for (const ch of CHARACTERS) {
    if (!ch.img.ready) continue;
    updateCharacter(ch, now);

    if (ch.state === 'sleep') {
      drawSleeping(ctx, ch, now);
      continue;
    }

    const walking = ch.state === 'walk';
    // при ходьбі — кадри циклу кроку; на місці — поза справи
    // (або її анімація, якщо в місця задані frames — напр. рука по струнах)
    const frames = ch.walkFrames || [1];
    const hasWalkCycle = frames.length > 1;
    let pose;
    if (walking) {
      // кадр кроку від ПРОЙДЕНОЇ ВІДСТАНІ (кадр ≈ stepPx, типово 36 px) —
      // ноги синхронні з рухом і не «ковзають» по підлозі
      pose = hasWalkCycle
        ? frames[Math.floor((ch.walkDist || 0) / (ch.stepPx || 36)) % frames.length]
        : frames[0];
    } else if (ch.spot && ch.spot.frames) {
      pose = ch.spot.frames[Math.floor(now / (ch.spot.frameMs || 300)) % ch.spot.frames.length];
    } else {
      pose = ch.spot ? ch.spot.pose : 0;
    }

    // на місці — спокійне дихання; при ходьбі зі справжніми кадрами
    // додаткове підстрибування не потрібне (його дають самі кадри)
    const bob = walking
      ? (hasWalkCycle ? 0 : -Math.abs(Math.sin(now * 0.012)) * 4)
      : Math.sin(now * 0.0018 + ch.breathPhase) * 2;

    // емоційна реакція на форс-мажор: тремтіння (наляк) / погойдування (злість)
    const emotion = currentFMEmotion(now);
    const shakeX = (emotion && !walking)
      ? (emotion === 'angry' ? Math.sin(now * 0.025) * 3 : Math.sin(now * 0.045) * 2)
      : 0;

    ctx.save();
    ctx.globalAlpha = ch.alpha;

    // контактна тінь (звужується в кроці — нога відривається від підлоги)
    ctx.fillStyle = 'rgba(25, 12, 5, 0.30)';
    ctx.beginPath();
    ctx.ellipse(ch.x, ch.y + 3, ch.shadow * (walking ? 0.8 : 1), 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // сам персонаж; дивиться вліво (ходьба вліво або flip місця) — дзеркалимо
    ctx.translate(ch.x + shakeX, ch.y + bob);
    // idle-«дихання» грудьми: тулуб ледь розширюється від ніг (вдих-видих).
    // Працює завжди, коли персонаж на місці — навіть без idle-кадрів
    if (!walking) {
      const breathe = 1 + Math.sin(now * 0.0021 + ch.breathPhase) * 0.009;
      ctx.scale(1, breathe);
    }
    if (walking && !hasWalkCycle) {
      // нахил у такт — тільки коли НЕМАЄ справжніх кадрів кроку
      ctx.rotate(Math.sin(now * 0.012) * 0.06);
    } else if (!walking && ch.spot && ch.spot.id === 'bunk') {
      // Тусовщик грає: погойдується в ритмі
      ctx.rotate(Math.sin(now * 0.008) * 0.04);
    }
    if (ch.facing < 0) ctx.scale(-1, 1);

    const lockLegs = !walking && ch.spot && ch.spot.frames
      && ch.spot.lockLegsY !== undefined && pose !== ch.spot.frames[0];

    if (lockLegs) {
      // складання на службовому полотні: верх — активний кадр,
      // низ ПОВНІСТЮ замінюється (не накладається!) ногами першого кадру
      const W = CHAR_CELL.w, H = CHAR_CELL.h, legY = ch.spot.lockLegsY;
      charScratchCtx.clearRect(0, 0, W, H);
      charScratchCtx.drawImage(ch.img, pose * W, 0, W, H, 0, 0, W, H);
      charScratchCtx.clearRect(0, legY, W, H - legY);
      charScratchCtx.drawImage(ch.img, ch.spot.frames[0] * W, legY, W, H - legY,
                               0, legY, W, H - legY);
      ctx.drawImage(charScratch, -W / 2, -H);
    } else {
      ctx.drawImage(
        ch.img,
        pose * CHAR_CELL.w, 0, CHAR_CELL.w, CHAR_CELL.h,
        -CHAR_CELL.w / 2, -CHAR_CELL.h, CHAR_CELL.w, CHAR_CELL.h
      );
    }
    ctx.restore();

    // нотки над гітарою — видно, що грає
    if (ch.id === 'party' && ch.state === 'idle' && ch.spot && ch.spot.id === 'bunk') {
      drawGuitarNotes(ctx, ch, now);
    }

    // бульбашка емоції над головою (поки триває форс-мажор або його реакція)
    if (emotion) drawEmotion(ctx, ch, emotion, now);
  }

  ctx.restore();
  renderCharsGeo(ctx);
}

// сплячий персонаж: лежить на своєму ліжку (якір — центр тіла),
// ледь дихає, над головою пливуть «z Z»
function drawSleeping(ctx, ch, now) {
  const s = ch.sleep;
  const W = CHAR_CELL.w, H = CHAR_CELL.h;

  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.rot) ctx.rotate(s.rot);
  if (s.flip) ctx.scale(-1, 1);
  ctx.scale(1, 1 + Math.sin(now * 0.0012 + ch.breathPhase) * 0.008); // дихання вві сні
  ctx.drawImage(ch.img, s.pose * W, 0, W, H, -W / 2, -H / 2, W, H);
  ctx.restore();

  // z Z над місцем сну
  ctx.save();
  ctx.font = '30px monospace';
  ctx.fillStyle = '#cfd8ff';
  for (let i = 0; i < 2; i++) {
    const phase = ((now * 0.00035) + i * 0.5 + ch.breathPhase) % 1;
    ctx.globalAlpha = (phase < 0.2 ? phase / 0.2 : 1 - phase) * 0.8;
    ctx.fillText(i === 0 ? 'z' : 'Z',
      s.x + 60 + Math.sin(phase * 5 + i) * 10,
      s.y - 60 - phase * 55 - i * 10);
  }
  ctx.restore();
}

// нотки ♪♫ пливуть угору від гітари і тануть
function drawGuitarNotes(ctx, ch, now) {
  const glyphs = ['♪', '♫', '♩'];
  ctx.save();
  ctx.font = '30px monospace';
  for (let i = 0; i < 3; i++) {
    const phase = ((now * 0.00045) + i / 3) % 1;
    const x = ch.x + 85 + Math.sin(phase * 7 + i * 2) * 14;
    const y = ch.y - 150 - phase * 90;
    ctx.globalAlpha = phase < 0.15 ? phase / 0.15 : 1 - phase;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(glyphs[i % 3], x, y);
  }
  ctx.restore();
}

// ---------- редактор місць (#chars-geo): тягни точки мишкою ----------

let charsGeoDrag = null; // {spot} — яку точку тягнемо

window.addEventListener('mousedown', (e) => {
  if (!charsGeoMode()) return;
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas) return;
  const pos = borisSceneCoords(e, canvas); // хелпер із boris.js
  for (const ch of CHARACTERS) {
    // місця сну (тягнеться саме лежаче тіло — воно й показується в редакторі)
    if (Math.hypot(pos.x - ch.sleep.x, pos.y - ch.sleep.y) < 70) {
      charsGeoDrag = { spot: ch.sleep };
      return;
    }
    for (const spot of ch.spots) {
      if (Math.hypot(pos.x - spot.x, pos.y - spot.y) < 60) {
        charsGeoDrag = { spot };
        return;
      }
    }
  }
});
window.addEventListener('mousemove', (e) => {
  if (!charsGeoDrag) return;
  const canvas = document.getElementById('scene');
  const pos = borisSceneCoords(e, canvas);
  charsGeoDrag.spot.x = pos.x;
  charsGeoDrag.spot.y = pos.y;
});
window.addEventListener('mouseup', () => { charsGeoDrag = null; });

function renderCharsGeo(ctx) {
  if (!charsGeoMode()) return;
  ctx.save();
  ctx.font = '20px monospace';
  ctx.textAlign = 'left';

  let line = 0;
  for (const ch of CHARACTERS) {
    // привид сплячого на ліжку — тягни його, щоб гарно покласти
    if (ch.img.ready) {
      const s = ch.sleep;
      const W = CHAR_CELL.w, H = CHAR_CELL.h;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.translate(s.x, s.y);
      if (s.rot) ctx.rotate(s.rot);
      if (s.flip) ctx.scale(-1, 1);
      ctx.drawImage(ch.img, s.pose * W, 0, W, H, -W / 2, -H / 2, W, H);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(120, 220, 120, 0.95)';
    ctx.beginPath();
    ctx.arc(ch.sleep.x, ch.sleep.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${ch.id}/sleep`, ch.sleep.x + 12, ch.sleep.y + 6);
    ctx.fillStyle = '#8ee08e';
    ctx.fillText(`${ch.id}/sleep: x:${Math.round(ch.sleep.x)}, y:${Math.round(ch.sleep.y)}`, 20, 60 + line * 26);
    line++;

    for (const spot of ch.spots) {
      ctx.fillStyle = 'rgba(255, 70, 70, 0.95)';
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${ch.id}/${spot.id}`, spot.x + 12, spot.y + 6);
      // список координат у кутку — спиши в characters.js
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`${ch.id}/${spot.id}: x:${Math.round(spot.x)}, y:${Math.round(spot.y)}`, 20, 60 + line * 26);
      line++;
    }
  }
  // рамки оклюдерів (столів) — блакитні
  if (typeof OCCLUDERS !== 'undefined') {
    ctx.strokeStyle = 'rgba(80, 200, 255, 0.9)';
    ctx.lineWidth = 3;
    for (const o of OCCLUDERS) {
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = 'rgba(80, 200, 255, 0.9)';
      ctx.fillText(o.id, o.x + 8, o.y + 24);
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillText('Тягни червоні точки мишкою; координати спиши у js/characters.js', 20, 30);
  ctx.restore();
}
