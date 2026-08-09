// ============================================
// force_majeure.js (ДАНІ) — форс-мажори (Етап 9)
// Логіка тригера/тривалих ефектів — у js/events.js (pickForceMajeure,
// applyLastingForceMajeure), візуальний слід — у js/scene.js.
// Всі числа — плейсхолдери, крутимо на Етапі 10.
//
// Форс-мажор = ТЕРМІНОВА картка (той самий формат, що events.js, + поля):
//   forceMajeure — true (позначка для двигуна)
//   emoji        — іконка в тексті
//   phases       — коли може статись: ['day','evening']
//   minDay       — не раніше цього дня (за замовч. 4 — «не в перші 3 дні»)
//   cooldownDays — не повторювати той самий FM стільки днів
//   baseChance   — базовий шанс за фазу (0..1)
//   riskWhen     — { stat: поріг } — нижче порога шанс росте на riskBonus
//   riskBonus    — надбавка до шансу за кожну «просілу» шкалу
//   emotion      — реакція мешканців, поки не вирішено ('scared'|'angry'|'nervous'|'sad')
//   trace        — який слід малювати, поки не вирішено ('puddle'|'wifi'|null)
//   lasting      — { perDay: {stat:±N}, toast } — тривалий ефект щоранку,
//                  поки гравець не обере варіант з resolves:true
//   reminderText — текст, коли проблема ТРИВАЄ і нагадує наступного дня (опц.)
//   reminderExtra— [choice,…] додаткові варіанти рішення, що з'являються на
//                  нагадуваннях (напр. позичити роутер у сусіда)
//   choices[i].resolves — true: цей вибір УСУВАЄ форс-мажор (слід і drain зникають)
//   Кнопка «🙈 Ігнорувати до кінця» (на нагадуваннях) — ставить ignored:true:
//   більше не нагадує, але щоденний lasting-мінус лишається.
// ============================================

const FORCE_MAJEURES = [
  {
    id: 'pipe_burst', emoji: '💧', title: 'Прорвало трубу!', emotion: 'scared', forceMajeure: true,
    phases: ['day', 'evening'], minDay: 4, cooldownDays: 8,
    baseChance: 0.22,
    trace: 'puddle',
    lasting: { perDay: { energy: -4, mental: -4 }, toast: '💧 Калюжа в кімнаті досі росте.' },
    text: 'У стіні щось гучно тріснуло — і посеред кімнати збирається калюжа. Треба щось робити.',
    reminderText: 'Калюжа посеред кімнати досі росте, підлога вже гуляє. Це точно треба спинити.',
    reminderExtra: [
      { label: '📞 Поскаржитись коменданту', effects: { energy: -4 }, resolves: true,
        result: 'Комендант прислав діда-сантехніка. Безкоштовно, повільно, але сухо.' },
    ],
    choices: [
      { label: '🔧 Викликати сантехніка (−250₴)',
        requires: { stat: 'money', gte: 250 },
        effects: { money: -250 }, resolves: true,
        result: 'Прийшов, побурчав про «руки-крюки будівельників», полагодив. Дорого, зате сухо.' },
      { label: '🪣 Вимити самому',
        effects: { energy: -15, mental: -5 }, resolves: true,
        result: 'Ганчірка, відро, дві години і пара ласкавих слів на адресу общаги. Але сухо.' },
      { label: '🙈 Поставити тазик і забити',
        effects: { mental: -3 },
        result: 'Тазик наповнюється щогодини. Проблема почекає. Калюжа — ні.' },
    ],
  },
  {
    id: 'internet_down', emoji: '📡', title: 'Інтернет помер!', emotion: 'angry', forceMajeure: true,
    phases: ['day', 'evening'], minDay: 4, cooldownDays: 7,
    baseChance: 0.22,
    trace: 'wifi',
    lasting: { perDay: { study: -5, social: -3 }, toast: '📡 Інтернету досі нема.' },
    text: 'Роутер блимає всіма кольорами відчаю, сторінки не вантажаться, а дедлайни — навпаки.',
    reminderText: 'Уже котрий день без нормального інтернету. Так і семестр завалити можна.',
    reminderExtra: [
      { label: '📶 Позичити роутер у Тусовщика', effects: { social: -4 }, resolves: true,
        result: 'Тусовщик дав старий роутер «на віки вічні». Інтернет знову ожив.' },
    ],
    choices: [
      { label: '💳 Викликати провайдера (−200₴)',
        requires: { stat: 'money', gte: 200 },
        effects: { money: -200 }, resolves: true,
        result: 'До вечора полагодили. Відео знову літає, конспекти завантажені.' },
      { label: '📱 Роздати з телефону',
        effects: { money: -50, energy: -4 }, resolves: true,
        result: 'Мобільний трафік тане на очах, але хоч методичку встиг стягнути.' },
      { label: '📵 Пожити без інтернету',
        effects: { mental: +4 },
        result: 'Несподіваний дзен. Вимушений, але дзен.' },
    ],
  },
  {
    id: 'roach_invasion', emoji: '🪳', title: 'Навала тарганів!', emotion: 'scared', forceMajeure: true,
    phases: ['evening'], minDay: 5, cooldownDays: 8,
    baseChance: 0.18, riskWhen: { mental: 30 }, riskBonus: 0.2,
    trace: null, // візуально відповідає система Бориса (js/boris.js)
    lasting: { perDay: { mental: -5 }, toast: '🪳 Таргани хазяйнують на кухні.' },
    text: 'Вранці на кухні їх було троє. Ввечері рахунок втрачено. Борис привів друзів.',
    reminderText: 'Тарганів уже не рахуєш — це вони рахують тебе. Час нарешті діяти.',
    choices: [
      { label: '🧴 Купити шприц з отрутою (−120₴)',
        requires: { stat: 'money', gte: 120 },
        effects: { money: -120, mental: +3 }, resolves: true,
        result: 'Обробив плінтуси. Уранці — тиша і кілька лапок догори. Перемога.' },
      { label: '☎️ Санстанція (−300₴)',
        requires: { stat: 'money', gte: 300 },
        effects: { money: -300, mental: +6 }, resolves: true,
        result: 'Приїхали в костюмах, як з фільму. Тепер тут стерильно, наче в лаборанта.' },
      { label: '🤝 Назвати їх сусідами',
        effects: { mental: -4 },
        result: 'Дав головному ім’я. Не допомогло, але якось спокійніше. Трохи.' },
    ],
  },
  {
    id: 'no_hot_water', emoji: '❄️', title: 'Немає гарячої води!', emotion: 'sad', forceMajeure: true,
    phases: ['day', 'evening'], minDay: 5, cooldownDays: 9,
    baseChance: 0.2,
    trace: null, // сліду на сцені не лишає
    lasting: { perDay: { energy: -4, mental: -3 }, toast: '❄️ Гарячої води так і нема.' },
    text: 'Відкрив кран — а звідти лише крижана цівка й зловісне булькання. Комунальники знову «планово».',
    reminderText: 'Гарячої води досі нема. Митися крижаною зранку — той ще квест.',
    // З'являється лише на НАСТУПНИЙ день, якщо проблема тягнеться: спершу
    // студент викручується сам, і аж коли набридло — йде проситись до друга.
    reminderExtra: [
      { label: '🚿 Помитись у друга в іншому крилі',
        requires: { stat: 'social', gte: 40 },
        effects: { social: -3 }, resolves: true,
        result: 'Терпець урвався — пішов до своїх у тепле крило. Пустили, але тепер ти їм винен пиво.' },
    ],
    choices: [
      // дідівський метод: працює, тому resolves — гравець дав собі раду
      { label: '🫗 Тазик з чайником у допомогу',
        requires: { stat: 'energy', gte: 30 },
        effects: { energy: -5, mental: +4 }, resolves: true,
        result: 'Задовбався бігати туди-сюди за чайником, зате взбадьорився.' },
      { label: '💪 Загартовуватись крижаною', resolves: true,
        roll: [
          { p: 0.5, effects: { energy: +4, mental: +3 }, result: 'Виявляється, бадьорить! Вийшов із душу новою людиною й фанатом моржування.' },
          { p: 0.5, effects: { energy: -8, mental: -6 }, result: 'Ні. Просто ні. Зуб на зуб не попадає, зате швидко.' },
        ] },
      // БЕЗ resolves — навмисно: не помитись не робить воду гарячою.
      // Проблема триває, завтра гра спитає знову.
      { label: '🙈 Не митись сьогодні',
        effects: { mental: -3, social: -5 },
        result: 'Дезодорант — друг студента. Але це не рішення, і ти це знаєш.' },
    ],
  },
  {
    id: 'iron_left_on', emoji: '🔥', title: 'Праска лишилась увімкненою!', emotion: 'scared', forceMajeure: true,
    phases: ['day', 'evening'], minDay: 6, cooldownDays: 10,
    baseChance: 0.16, riskWhen: { energy: 30 }, riskBonus: 0.15, // втомлений — забудькуватий
    trace: null, // одноразова подія, сліду не лишає
    text: 'Зайшов у кімнату — пахне паленим. Праска, яку «на секундочку» лишив на сорочці, вже пропалила діру й тихо димить.',
    choices: [
      { label: '🔌 Вимкнути й провітрити',
        effects: { energy: -4, mental: -5 }, resolves: true,
        result: 'Устиг! Сорочці кінець, зате кімната ціла. Урок затямив... мабуть.' },
      { label: '👕 Оплакати улюблену сорочку',
        effects: { money: -300, mental: -6 }, resolves: true,
        result: 'Улюблена сорочка перетворилась на ганчірку. Доведеться купувати нову.' },
    ],
  },
  {
    id: 'inspection', emoji: '👮', title: 'Раптова перевірка!', emotion: 'nervous', forceMajeure: true,
    phases: ['day'], minDay: 6, cooldownDays: 10,
    baseChance: 0.16, riskWhen: { social: 40 }, riskBonus: 0.15,
    trace: null, // одноразова подія, сліду не лишає
    text: 'Стук у двері: «Перевірка! Комендант з обходом». А в тебе тут... живопис маслом по підлозі.',
    choices: [
      { label: '😇 Заговорити зуби',
        requires: { stat: 'social', gte: 50 },
        effects: { social: -4 }, resolves: true,
        result: 'Півгодини балачок про життя й погоду — і комендант пішов задоволений. Пронесло.' },
      { label: '🧹 Гарячково прибрати',
        effects: { energy: -12 }, resolves: true, cleanRoom: true,
        result: 'Запхав усе під ліжко за рекордний час. Зійшло, хоч спина мокра.' },
      { label: '🤷 Отримати штраф (−200₴)',
        effects: { money: -200, mental: -5 }, resolves: true,
        result: 'Протокол, штраф і лекція про совість. Класика жанру общаги.' },
    ],
  },
];
