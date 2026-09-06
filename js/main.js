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

/**
 * Показати сцену з центру (актуально на телефоні, де вона ширша за екран).
 * На комп'ютері прокручувати нічого — функція нічого й не робить.
 */
function centerSceneScroll() {
  const wrap = document.getElementById('scene-wrap');
  if (!wrap) return;
  // трохи зачекати, поки браузер порахує реальні розміри полотна
  requestAnimationFrame(() => {
    const extra = wrap.scrollWidth - wrap.clientWidth;
    if (extra > 0) {
      wrap.scrollLeft = extra / 2;
      hintScrollOnce();
    }
  });
}

/**
 * Підказати, що кімнату можна гортати — інакше гравець побачить лише
 * середину і не здогадається, що ліворуч і праворуч є сусіди.
 * Показуємо ОДИН раз за сесію, щоб не набридати.
 */
function hintScrollOnce() {
  if (hintScrollOnce._done) return;
  hintScrollOnce._done = true;
  if (typeof showToast !== 'function') return;
  setTimeout(() => showToast('👈 Кімнату можна гортати вбік 👉', 5000), 900);
}

function init() {
  const canvas = document.getElementById('scene');
  canvas.width = CONFIG.SCENE_WIDTH;   // роздільність задає CONFIG, не HTML
  canvas.height = CONFIG.SCENE_HEIGHT;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false; // чіткі пікселі при масштабуванні

  // 📱 На телефоні сцена ширша за екран (щоб кімната була велика,
  // а не дрібною смужкою) — тож показуємо її з ЦЕНТРУ, а не з лівого
  // краю. Інакше гравець на старті бачив би стіну з плакатами
  // й не здогадувався, що вбік можна гортати.
  centerSceneScroll();
  window.addEventListener('resize', centerSceneScroll);

  // ============================================
  // 🍏 ВИПРАВЛЕННЯ ДЛЯ iPhone — не прибирати!
  //
  // СИМПТОМ: на Android усе тикається, на iPhone не працює НІЩО в кімнаті —
  // ні сусіди, ні тарган, ні предмети.
  //
  // ПРИЧИНА: Safari на iOS не розсилає подію click куди завгодно. Він спершу
  // вирішує, чи елемент узагалі «клікабельний», і вважає таким лише:
  // посилання, кнопки, поля вводу — АБО елемент, на якому висить власний
  // обробник кліку чи стоїть cursor: pointer.
  //
  // У нас же всі три обробники (сусіди — npc.js, тарган — boris.js,
  // предмети — minigames.js) висять на WINDOW, а не на самому canvas.
  // Для Safari canvas — звичайна картинка, тож він не створює клік узагалі,
  // і до window нічого не долітає. Chrome на Android таких припущень
  // не робить — тому в друга все працювало.
  //
  // ЛІКИ: повісити на canvas ВЛАСНИЙ обробник. Він нічого не робить —
  // сам факт його існування переконує Safari, що елемент клікабельний.
  // Далі клік нормально спливає до window, і всі три системи оживають.
  //
  // Друга половина ліків — cursor: pointer для сенсорних екранів,
  // див. css/style.css (@media (hover: none)).
  canvas.addEventListener('click', () => {});

  // тест-режими обходять стартове меню
  const isTestMode = /^#(card-|fm-|calendar-|boris|finale|gameover-|chars-geo|props-geo|phase-|shop|ai|xbox|intro|auth)/.test(location.hash);

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
    // #intro або #intro-N — подивитись вступ (N — номер слайда з 0),
    // не починаючи нової гри. Зручно, коли правиш тексти знайомства.
    const introTest = location.hash.match(/^#intro(?:-(\d+))?$/);
    if (introTest && typeof showIntro === 'function') {
      showIntro(introTest[1] ? parseInt(introTest[1], 10) : 0);
    }
    // #auth — подивитись екран входу, не чекаючи сервера (#auth-register —
    // одразу вкладку реєстрації). Зручно, коли правиш тексти чи стилі:
    // з диска сервер усе одно недосяжний через CORS.
    // #auth — екран вибору (три кнопки), #auth-login / #auth-register —
    // одразу потрібна форма
    if (location.hash.startsWith('#auth')) {
      if (location.hash === '#auth-login') showAuthScreen('login');
      else if (location.hash === '#auth-register') showAuthScreen('register');
      else if (typeof showAuthChoiceScreen === 'function') showAuthChoiceScreen();
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
    // Звичайний запуск. apiBoot() (js/api.js) сам вирішує, що показати:
    // не залогінений і сервер живий → екран входу;
    // залогінений → забирає сейв із сервера і показує «Продовжити»;
    // сервера нема → одразу стартовий екран, гра працює офлайн.
    renderHUD();
    renderDecisionZone();
    if (typeof apiBoot === 'function') apiBoot();
    else showStartScreen();
  }

  requestAnimationFrame(gameLoop);
}

function gameLoop() {
  renderScene(ctx);
  // HUD перемальовується окремо при зміні стану (renderHUD),
  // але поки стан статичний — оновлюємо раз на кадр не потрібно.
  requestAnimationFrame(gameLoop);
}

/**
 * ЧИТ-ПАНЕЛЬ: клавіша D (або В на українській розкладці).
 *
 * ⚠️ ДВІ ПЕРЕВІРКИ, і обидві з'явились не просто так.
 *
 * 1. ЧИ НЕ ПИШЕ ЗАРАЗ ГРАВЕЦЬ У ПОЛЕ.
 *    Баг, який знайшла Даша: вписуєш логін або пароль, у якому є літера
 *    «d» — і замість букви відкривається чит-панель. Те саме ламало й
 *    поле імені у вступі («Дмитро», «Вадим»…).
 *    Причина: обробник висить на ВСЬОМУ вікні й не питає, куди саме
 *    гравець зараз друкує. Тепер питає.
 *
 * 2. ЧИ МОЖНА ЇЇ ЦІЙ ЛЮДИНІ ВЗАГАЛІ.
 *    Панель крутить шкали й відкриває магазин без обмежень — гравцеві
 *    в інтернеті вона ні до чого. Див. cheatsAllowed().
 */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'd' && e.key !== 'D' && e.key !== 'в' && e.key !== 'В') return;

  // гравець друкує в полі — це буква, а не команда
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

  if (!cheatsAllowed()) return;
  toggleCheatPanel();
});

/**
 * КОМУ ДОСТУПНА ЧИТ-ПАНЕЛЬ.
 *
 * Дозволяємо у двох випадках:
 *   • гра відкрита З ДИСКА або з localhost — це розробка, тут Даша й має
 *     крутити шкали, щоб перевіряти екрани;
 *   • або гравець залогінений і має роль ADMIN (поле role у app.users;
 *     за замовчуванням у всіх PLAYER, змінюється тільки прямо в базі).
 *
 * ⚠️ Це НЕ захист даних, а прибирання спокуси: сама панель живе в коді
 * гри, і той, хто вміє відкрити F12, дотягнеться до неї в будь-якому разі.
 * Справжній захист від шахрайства стоїть на сервері — він перевіряє межі
 * шкал і те, що день не йде назад (GameService.save). Накрутити собі
 * мільйон через панель можна, але сервер такий сейв не прийме.
 */
function cheatsAllowed() {
  const local = location.protocol === 'file:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1';
  if (local) return true;

  return typeof apiState !== 'undefined'
      && apiState.user
      && apiState.user.role === 'ADMIN';
}

document.addEventListener('DOMContentLoaded', init);
