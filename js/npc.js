// ============================================
// npc.js — сусіди: клік → діалог → квести (Етап 8)
//
// Клік по Ботану або Тусовщику відкриває діалогове вікно (ui.js showDialog).
// Що покаже діалог — вирішує openNpcDialog за станом:
//   1) є дозріла нагорода → сусід вручає її;
//   2) квест узято, ще не визрів → «чекай, скоро»;
//   3) доступний новий квест (👥 ≥ minSocial) → пропозиція з кнопками;
//   4) інакше — випадкова репліка (за 👥: низька → відмахується).
//
// Дані сусідів і квестів — data/quests.js.
// Стан квестів живе у gameState.flags.quests (тому зберігається):
//   { <quest_id>: { status: 'active'|'done', dueDay } }
// ============================================

// лінива ініціалізація сховища квестів у flags (як cardHistory в events.js)
function questState() {
  if (!gameState.flags.quests) gameState.flags.quests = {};
  return gameState.flags.quests;
}

function npcRandomLine(npc) {
  const pool = gameState.stats.social < 30 ? npc.linesLow : npc.linesHigh;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- відкриття діалогу за станом ----------

function openNpcDialog(npcId) {
  const npc = NPC_DATA[npcId];
  const day = gameState.day;
  const qs = questState();

  // 1) дозріла нагорода цього сусіда?
  const due = QUESTS.find(q => q.npc === npcId
    && qs[q.id] && qs[q.id].status === 'active' && qs[q.id].dueDay <= day);
  if (due) { giveQuestReward(npc, due); return; }

  // 2) квест узято, але ще не час?
  const pending = QUESTS.find(q => q.npc === npcId
    && qs[q.id] && qs[q.id].status === 'active');
  if (pending) {
    showDialog(npc, `<p class="dialog-say">${npc.waitLine}</p>`,
      [{ label: 'Ок', onClick: hideOverlay }]);
    return;
  }

  // 3) доступний новий квест (👥 достатньо, ще не брали АБО відмова «вивітрилась»)?
  const offer = QUESTS.find(q => q.npc === npcId
    && questOfferable(q) && gameState.stats.social >= q.minSocial);
  if (offer) { showQuestOffer(npc, offer); return; }

  // 4) інакше — просто балачка (низька 👥 → сухо відмахнеться)
  showDialog(npc, `<p class="dialog-say">${npcRandomLine(npc)}</p>`,
    [{ label: 'Бувай', onClick: hideOverlay }]);
}

// пропозиція квесту: текст + кнопки «прийняти / відмовитись»
function showQuestOffer(npc, q) {
  const needMet = !q.requires || gameState.stats[q.requires.stat] >= q.requires.gte;
  const acceptBtn = needMet
    ? { label: q.acceptLabel, onClick: () => acceptQuest(npc, q) }
    : { label: q.acceptLabel, locked: true,
        reason: `потрібно ${STAT_ICONS[q.requires.stat]} ≥ ${q.requires.gte}` };

  showDialog(npc, `<p class="dialog-say">${q.offerText}</p>`, [
    acceptBtn,
    { label: q.declineLabel, secondary: true, onClick: () => declineQuest(q) },
  ]);
}

// відмовлений квест «вивітрюється» і може знову зринути через стільки днів
const QUEST_RETRY_DAYS = 19;

// чи можна зараз пропонувати цей квест:
// ще не брали, АБО відмовились, але минуло QUEST_RETRY_DAYS днів (друга спроба).
// (active/done більше не пропонуються)
function questOfferable(q) {
  const st = questState()[q.id];
  if (!st) return true;
  if (st.status === 'declined' && gameState.day - st.declinedDay >= QUEST_RETRY_DAYS) return true;
  return false;
}

// гравець відмовився: квест ховаємо (позначаємо 'declined' + день відмови) і
// просто ЗАКРИВАЄМО вікно. Наступний стан (новий квест через час або звичайна
// репліка) з'явиться вже при наступному кліку на сусіда.
function declineQuest(q) {
  questState()[q.id] = { status: 'declined', declinedDay: gameState.day };
  saveGame();
  hideOverlay();
}

// гравець погодився: миттєві ефекти + завести таймер нагороди
function acceptQuest(npc, q) {
  for (const [stat, delta] of Object.entries(q.acceptEffects || {})) changeStat(stat, delta);
  if (q.cleanRoom) gameState.flags.roomCleanedDay = gameState.day; // прибрав → чисто на день
  questState()[q.id] = { status: 'active', dueDay: gameState.day + q.delayDays };
  saveGame();
  showDialog(npc, `
    <p class="dialog-say">${q.acceptResult}</p>
    ${effectChipsHtml(q.acceptEffects)}`,
    [{ label: 'Ок', onClick: hideOverlay }]);
  renderHUD();
}

// нагорода визріла: застосувати ефекти, закрити квест, показати подяку
function giveQuestReward(npc, q) {
  for (const [stat, delta] of Object.entries(q.rewardEffects || {})) changeStat(stat, delta);
  questState()[q.id].status = 'done';
  if (gameState.counters) gameState.counters.questsDone = (gameState.counters.questsDone || 0) + 1;
  saveGame();
  showDialog(npc, `
    <p class="dialog-say">${q.rewardText}</p>
    ${effectChipsHtml(q.rewardEffects)}`,
    [{ label: 'Дякую!', onClick: hideOverlay }]);
  renderHUD();
}

// вранішнє нагадування (тост): хтось із сусідів чекає з нагородою.
// Викликається з enterPhase на ранковій фазі.
function questReminders() {
  const day = gameState.day;
  const qs = questState();
  const ready = QUESTS.filter(q => qs[q.id]
    && qs[q.id].status === 'active' && qs[q.id].dueDay <= day);
  if (!ready.length || typeof showToast !== 'function') return;
  const names = [...new Set(ready.map(q => NPC_DATA[q.npc].name))];
  showToast(`🔔 ${names.join(' і ')} тебе виглядає — підійди поговорити.`);
}

// ---------- клік і курсор по сусідах ----------

// чи можна зараз клікати по кімнаті (не в меню/редакторі)
function npcInteractive() {
  const overlay = document.getElementById('overlay');
  if (overlay && !overlay.classList.contains('hidden')) return false; // відкрите вікно
  if (/geo/.test(location.hash)) return false;                        // редактори
  return true;
}

// який сусід під точкою (хіт-бокс — вужчий за комірку спрайта: тіло персонажа)
// 'player' — сам гравець: люди по ньому теж тикають, тому він відповідає
// (див. showSelfThoughts)
function npcAt(pos) {
  for (const id of ['botan', 'party', 'player']) {
    const ch = CHARACTERS.find(c => c.id === id);
    if (!ch || !ch.img || !ch.img.ready) continue;
    const halfW = 65, top = ch.y - 290;
    if (pos.x >= ch.x - halfW && pos.x <= ch.x + halfW && pos.y >= top && pos.y <= ch.y) {
      return id;
    }
  }
  return null;
}

window.addEventListener('mousemove', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas || !npcInteractive()) return;
  const pos = borisSceneCoords(e, canvas); // хелпер із boris.js
  // курсор-вказівник над сусідом (Борис керує курсором у своєму listener окремо)
  if (npcAt(pos)) canvas.style.cursor = 'pointer';
});

window.addEventListener('click', (e) => {
  const canvas = document.getElementById('scene');
  if (!canvas || e.target !== canvas || !npcInteractive()) return;
  const pos = borisSceneCoords(e, canvas);
  // клік по Борису — це тапок (обробляє boris.js), діалог не відкриваємо
  if (typeof borisHitTest === 'function' && borisHitTest(pos.x, pos.y)) return;
  const id = npcAt(pos);
  if (id === 'player') showSelfThoughts();   // тикнули по собі
  else if (id) openNpcDialog(id);
});

/**
 * КЛІК ПО САМОМУ СОБІ (спостереження Даші: люди тикають і на головного).
 *
 * Замість «нічого не відбувається» — персонаж каже, як він почувається.
 * Це не просто пасхалка: гравець бачить, що означають шкали, живою мовою,
 * а не самими цифрами. «⚡ 18» мало про що каже, а «очі злипаються прямо
 * зараз» — цілком зрозуміло.
 *
 * Скаржиться на НАЙГІРШУ шкалу: так підказка вказує, що лагодити першим.
 */
function showSelfThoughts() {
  const s = gameState.stats;
  const name = (gameState.student && gameState.student.fullName) || 'Студент';

  // репліки на кожну шкалу: перша — коли зовсім погано, друга — так собі
  const LINES = {
    energy: {
      bad: ['Очі злипаються. Ще трохи — і засну прямо тут, у худі й кросівках.',
            'Тіло каже «досить», голова каже «ще трохи». Обоє брешуть.'],
      mid: ['Втомився, але живий. Кава ще тримає оборону.'],
    },
    mental: {
      bad: ['Усе дратує: сусіди, чат групи, навіть Борис. Треба видихнути.',
            'Голова гуде. Хочеться, щоб усі просто помовчали хвилин десять.'],
      mid: ['Настрій так собі. Але бувало й гірше — і не раз.'],
    },
    study: {
      bad: ['Конспекти дивляться на мене з докором. Я на них — теж.',
            'Здається, я відстав. Ні, точно відстав. Питання лише наскільки.'],
      mid: ['З навчанням не блискуче, але деканат поки мовчить.'],
    },
    social: {
      bad: ['Здається, я вже кілька днів ні з ким нормально не говорив.',
            'Пів поверху знає одне одного, а я досі «той із 9-го».'],
      mid: ['З людьми нормально. Не душа компанії, але свій.'],
    },
  };

  // гроші окремо: у них своя шкала, не 0–100
  const moneyLine = s.money <= 100
    ? 'У кишені вітер. Навіть на каву треба думати двічі.'
    : s.money <= 400 ? 'Грошей обмаль. До стипендії ще дожити треба.' : null;

  // шукаємо найгіршу шкалу — про неї й скаржимось
  const scales = [
    { key: 'energy', v: s.energy },
    { key: 'mental', v: s.mental },
    { key: 'study', v: s.study },
    { key: 'social', v: s.social },
  ].sort((a, b) => a.v - b.v);

  const worst = scales[0];
  let text;

  if (worst.v < 30) {
    const arr = LINES[worst.key].bad;
    text = arr[Math.floor(Math.random() * arr.length)];
  } else if (moneyLine) {
    text = moneyLine;
  } else if (worst.v < 55) {
    text = LINES[worst.key].mid[0];
  } else {
    text = 'А непогано тримаюсь, як для кінця місяця. Може, і до стипендії дотягну.';
  }

  showOverlay(`
    <div class="window dialog">
      <div class="dialog-head">
        <span class="dialog-emoji">🧑‍🎓</span>
        <span class="dialog-who">
          <b>${name}</b>
          <span class="dim">сам собі під ніс</span>
        </span>
      </div>
      <p class="dialog-say">«${text}»</p>
      <button class="btn" id="self-close">Зрозуміло</button>
    </div>`);
  document.getElementById('self-close').onclick = hideOverlay;
}
