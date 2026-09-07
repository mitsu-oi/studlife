// Симулятор балансу: проганяє N партій і рахує, скільки доходять до 30-го дня.
// Не замінює живу гру, але швидко показує, чи не стало НЕПРОХІДНО.
const fs = require('fs'), vm = require('vm');
const ROOT = 'D:/Dasha/StudLife/';

const ctx = { console, Math, Object, JSON, window: {}, document: { getElementById: () => null } };
vm.createContext(ctx);
for (const f of ['data/balance.js', 'data/events.js']) {
  vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx);
}
// const-оголошення не потрапляють у ctx як властивості — дістаємо виразом
const { BALANCE, EVENTS_DATA, MORNING_WEEKDAY_CARDS, MORNING_WEEKEND_CARDS } =
  vm.runInContext('({BALANCE, EVENTS_DATA, MORNING_WEEKDAY_CARDS, MORNING_WEEKEND_CARDS})', ctx);

// ---------- ПЕРЕВИЗНАЧЕННЯ З КОМАНДНОГО РЯДКА ----------
// Щоб перевірити варіант, не правлячи balance.js:
//   node tools/balance_sim.js energy=-4 money=-75
// Приймає будь-яке поле з BALANCE.daily, а також start.money, weekendEnergy.
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split('=');
  const n = Number(v);
  if (Number.isNaN(n)) continue;
  if (k === 'weekendEnergy') BALANCE.weekendEnergy = n;
  else if (k.startsWith('start.')) BALANCE.start[k.slice(6)] = n;
  else BALANCE.daily[k] = n;
}
console.log('щодня:', JSON.stringify(BALANCE.daily),
            '| старт:', JSON.stringify(BALANCE.start),
            '| вихідні ⚡:', BALANCE.weekendEnergy);

const TOTAL = 30;
const isWeekend = d => (d - 1) % 7 >= 5;
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (k, v) => k === 'money' ? Math.max(0, v) : Math.min(100, Math.max(0, v));

// СТРАТЕГІЯ ГРАВЦЯ: 'random' — тикає навмання; 'smart' — латає найгіршу шкалу
function playOne(strategy) {
  const s = { ...BALANCE.start };
  const apply = fx => { for (const [k, v] of Object.entries(fx || {})) s[k] = clamp(k, (s[k] || 0) + v); };

  const chooseIdx = (choices) => {
    const ok = choices.filter(c => !c.requires || s[c.requires.stat] >= c.requires.gte);
    if (!ok.length) return choices[0];
    if (strategy === 'random') return pick(ok);
    // «розумний»: обирає варіант, який найбільше піднімає найслабшу шкалу
    const worst = ['energy', 'mental', 'study', 'social']
      .sort((a, b) => s[a] - s[b])[0];
    const need = s.money < 300 ? 'money' : worst;
    return ok.slice().sort((a, b) => (b.effects?.[need] || 0) - (a.effects?.[need] || 0))[0];
  };

  const take = card => {
    if (!card) return;
    const ch = chooseIdx(card.choices);
    if (ch.roll) { let r = Math.random(); let o = ch.roll[ch.roll.length - 1];
      for (const x of ch.roll) { if (r < x.p) { o = x; break; } r -= x.p; } apply(o.effects); }
    else apply(ch.effects);
  };

  for (let day = 1; day <= TOTAL; day++) {
    // щоденні витрати
    apply(BALANCE.daily);
    if (isWeekend(day)) apply({ energy: BALANCE.weekendEnergy });
    if (s.money <= 0) apply(BALANCE.broke);

    take(pick(isWeekend(day) ? MORNING_WEEKEND_CARDS : MORNING_WEEKDAY_CARDS));

    // день і вечір: приблизно по одній картці (як у грі)
    for (const phase of ['day', 'evening']) {
      const pool = EVENTS_DATA.filter(c => c.phases?.includes(phase)
        && (c.weekend === undefined || c.weekend === isWeekend(day))
        && (!c.minDay || day >= c.minDay));
      if (pool.length && Math.random() < 0.85) take(pick(pool));
    }

    for (const k of ['energy', 'mental', 'study']) {
      if (s[k] <= 0) return { survived: false, day, reason: k };
    }
  }
  return { survived: true, day: TOTAL, stats: s };
}

for (const strategy of ['random', 'smart']) {
  const N = 2000, res = [];
  for (let i = 0; i < N; i++) res.push(playOne(strategy));
  const win = res.filter(r => r.survived);
  const byReason = {};
  res.filter(r => !r.survived).forEach(r => byReason[r.reason] = (byReason[r.reason] || 0) + 1);
  const avgDay = (res.reduce((a, r) => a + r.day, 0) / N).toFixed(1);
  const avgMoney = win.length ? Math.round(win.reduce((a, r) => a + r.stats.money, 0) / win.length) : 0;

  console.log(`\n=== ${strategy === 'random' ? 'НАВМАННЯ' : 'ГРАЄ РОЗУМНО'} (${N} партій) ===`);
  console.log(`  дожили до 30-го дня : ${(win.length / N * 100).toFixed(1)}%`);
  console.log(`  середній день кінця : ${avgDay}`);
  console.log(`  через що програли   : ${JSON.stringify(byReason)}`);
  console.log(`  гроші у фіналі      : ${avgMoney} ₴`);
}
