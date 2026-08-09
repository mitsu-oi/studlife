// ============================================
// main.js — ініціалізація і головний цикл
// ============================================

let ctx;

// Якщо десь у коді станеться помилка — показати її прямо в HUD
// (інакше гра мовчки «замерзає», і незрозуміло чому)
window.addEventListener('error', (e) => {
  const hud = document.getElementById('hud');
  if (hud) {
    const file = (e.filename || '').split('/').pop();
    hud.innerHTML = `<span style="color:#ff6b6b">⚠ ПОМИЛКА: ${e.message} — ${file}:${e.lineno}</span>`;
  }
});

function init() {
  const canvas = document.getElementById('scene');
  canvas.width = CONFIG.SCENE_WIDTH;   // роздільність задає CONFIG, не HTML
  canvas.height = CONFIG.SCENE_HEIGHT;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // чіткі пікселі при масштабуванні

  // тест-режими обходять стартове меню
  const isTestMode = /^#(card-|fm-|calendar-|boris|finale|gameover-|chars-geo|props-geo|phase-|shop|ai|xbox)/.test(location.hash);

  if (isTestMode) {
    enterPhase();
    const calTest = location.hash.match(/^#calendar-(\d+)/);
    if (calTest) {
      gameState.day = Math.min(parseInt(calTest[1], 10), CONFIG.TOTAL_DAYS);
      renderHUD();
      showCalendar();
    }
    // #finale — подивитись фінальний екран з демо-статистикою
    if (location.hash === '#finale') {
      gameState.stats = { money: 800, energy: 65, mental: 72, social: 61, study: 64 };
      gameState.counters = { lectures: 12, work: 5, sleepIns: 4, boris: 7 };
      renderHUD();
      showFinale();
    }
    // #phase-night (morning/day/evening) — подивитись світло і поведінку фази
    const phaseTest = location.hash.match(/^#phase-(morning|day|evening|night)$/);
    if (phaseTest) {
      gameState.phase = phaseTest[1];
      renderHUD();
      renderDecisionZone();
    }
    // #gameover-energy / -mental / -study — подивитись екрани програшу
    const goTest = location.hash.match(/^#gameover-(energy|mental|study)$/);
    if (goTest) {
      gameState.stats[goTest[1]] = 0;
      gameState.day = 14;
      renderHUD();
      showGameOver(checkGameOver());
    }
    // #shop — відкрити магазин одразу (грошей досить, щоб усе купити)
    if (location.hash === '#shop') {
      gameState.stats.money = 5000;
      renderHUD();
      if (typeof showShopping === 'function') showShopping(true);
    }
    // #boris-run — одразу запустити мінігру про Бориса; #xbox — меню аркад
    if (location.hash === '#boris-run') startBorisRun();
    if (location.hash === '#xbox') showXboxMenu();
    // #ai — попросити ШІ-картку і показати її, щойно прийде (для перевірки
    // тону і того, чи взагалі працює скринька). Помилку видно в HUD.
    if (location.hash === '#ai') {
      gameState.phase = 'evening';
      showToast('🤖 Прошу картку в ШІ…');
      aiPrefetch().then(() => {
        const card = aiState.queue.shift();
        if (card) {
          aiNoteTopic(card.topic);
          cardState.card = card;
          cardState.resolvedText = null;
          cardState.resolvedEffects = null;
          renderHUD();
          renderDecisionZone();
        } else {
          showToast('❌ ШІ не відповів — дивись консоль (F12)');
        }
      });
    }
  } else {
    // звичайний запуск: стартовий екран Продовжити / Нова гра
    renderHUD();
    renderDecisionZone();
    showStartScreen();
  }

  requestAnimationFrame(gameLoop);
}

function gameLoop() {
  renderScene(ctx);
  // HUD перемальовується окремо при зміні стану (renderHUD),
  // але поки стан статичний — оновлюємо раз на кадр не потрібно.
  requestAnimationFrame(gameLoop);
}

// чит-панель: D (або В на укр. розкладці)
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') {
    toggleCheatPanel();
  }
});

document.addEventListener('DOMContentLoaded', init);
