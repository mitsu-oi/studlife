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
function npcAt(pos) {
  for (const id of ['botan', 'party']) {
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
  if (id) openNpcDialog(id);
});
