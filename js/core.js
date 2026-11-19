/* =========================================================================
   L'AURUM (Dodo Pizza & Dodo IS Architecture) — Единое облачное ядро БД
   Связывает 2 отдельных репозитория через общую базу Supabase:
   1) site-1-guest     — Клиентский сайт (гость видит ТОЛЬКО свои брони и заказы)
   2) site-2-staff-erp — Внутренняя система Dodo IS (каждый сотрудник видит ТОЛЬКО интерфейс своей роли)
   ========================================================================= */

(function () {
  const STORAGE_KEY = "laurum_dodo_erp_v6";
  const SESSION_ID_KEY = "laurum_anon_session_id";
  const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_Q8bp5yDcT3g-b0K7tnvbfw_RYFYDkMi";

  // Уникальный ID браузерной сессии для гостей без регистрации (чтобы они видели только свои заказы текущей сессии)
  function getAnonSessionId() {
    let sid = sessionStorage.getItem(SESSION_ID_KEY);
    if (!sid) {
      sid = "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem(SESSION_ID_KEY, sid);
    }
    return sid;
  }

  const ROLE_INFO = {
    guest: { title: "Гость", badge: "bg-orange-100 text-orange-800" },
    cook: { title: "Повар кухни (KDS Трекер)", badge: "bg-amber-100 text-amber-800" },
    waiter: { title: "Официант / Хостес зала", badge: "bg-blue-100 text-blue-800" },
    accountant: { title: "Бухгалтер / Складской учёт", badge: "bg-emerald-100 text-emerald-800" },
    boss: { title: "Босс / Менеджер смены (Dodo IS)", badge: "bg-purple-100 text-purple-800" }
  };

  // Официальные статусы заказа по архитектуре Dodo IS (из таблицы статусов)
  const DODO_ORDER_STATES = {
    accepted: { code: 1, key: "accepted", title: "Принят", desc: "Заказ принят и передан на кухню" },
    cooking: { code: 2, key: "cooking", title: "Кухня (Готовится)", desc: "Повар взял блюдо в работу (Раскатка / Гриль / Печь)" },
    ready: { code: 3, key: "ready", title: "На тепловой полке", desc: "Блюдо готово на раздаче и ожидает подачи к столу" },
    served: { code: 5, key: "served", title: "Заказ выполнен (Подан)", desc: "Подано гостю за стол" },
    storno: { code: 10, key: "storno", title: "Сторно (Брак / Возврат)", desc: "Блюдо списано по браку / возврату" }
  };

  const ALLERGENS = {
    gluten: "Глютен",
    lactose: "Лактоза",
    nuts: "Орехи",
    eggs: "Яйца",
    fish: "Рыба",
    shellfish: "Морепродукты"
  };

  const DONENESS = ["Rare", "Medium Rare", "Medium", "Medium Well", "Well Done"];

  const REVIEW_TAGS = [
    "Идеально вкусно",
    "Горячее и свежее",
    "Быстрая подача",
    "Пересолено",
    "Остыло",
    "Маленькая порция",
    "Не та прожарка"
  ];

  const COMPLAINT_REASONS = [
    "Блюдо подали холодным / остывшим",
    "Ошибка повара (не убрали лук / не та прожарка)",
    "Пересолено / пережарено",
    "Посторонний предмет в блюде",
    "Маленькая порция"
  ];

  const SUPPLIERS = [
    "ТОО «KazBeef Prime» (Мраморная говядина и ягнёнок)",
    "ТОО «Italia Gastro Import» (Сыры, паста, мука, масло)",
    "«Almaty Fresh Farm» (Фермерские овощи, томаты, зелень)",
    "«Ocean & Fjords KZ» (Охлаждённый лосось и креветки)",
    "«Grand Beverage KZ» (Напитки, лимонады, кофе зерно)"
  ];

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  }

  function dateOffset(days) {
    const d = new Date(Date.now() + (days || 0) * 86400000);
    return d.toISOString().split("T")[0];
  }

  function fmt(num) {
    return Math.round(Number(num || 0)).toLocaleString("ru-RU") + " ₸";
  }

  function buildSeedData() {
    const today = dateOffset(0);
    const tomorrow = dateOffset(1);

    return {
      updated_at: new Date().toISOString(),
      profiles: [
        { id: "u-boss", full_name: "Арман Султанов", role: "boss", login: "boss", password: "123", phone: "+7 701 100 00 01", hourly_rate: 6000, bonus_balance: 0, is_active: true },
        { id: "u-acc", full_name: "Мадина Касымова", role: "accountant", login: "buh", password: "123", phone: "+7 701 100 00 02", hourly_rate: 4500, bonus_balance: 0, is_active: true },
        { id: "u-chef", full_name: "Лоран Вальтер (Шеф-повар)", role: "cook", login: "chef", password: "123", phone: "+7 701 100 00 03", hourly_rate: 5000, bonus_balance: 0, is_active: true, station: "Горячий цех / Гриль" },
        { id: "u-cook2", full_name: "Данияр Алиев (Пиццамейкер / Паста)", role: "cook", login: "povar", password: "123", phone: "+7 701 100 00 04", hourly_rate: 3800, bonus_balance: 0, is_active: true, station: "Раскатка / Печь" },
        { id: "u-waiter", full_name: "Айгерим Нурланова", role: "waiter", login: "waiter", password: "123", phone: "+7 701 100 00 05", hourly_rate: 2800, bonus_balance: 0, is_active: true },
        { id: "u-guest-1", full_name: "Алия Сатпаева", role: "guest", login: "aliya", password: "123", phone: "+7 701 555 01 01", hourly_rate: 0, bonus_balance: 4500, is_active: true }
      ],

      zones: [
        { id: "z-main", name: "Основной зал", is_vip: false, deposit_per_guest: 5000, deposit_per_table: 0 },
        { id: "z-terrace", name: "Панорамная терраса", is_vip: false, deposit_per_guest: 5000, deposit_per_table: 0 },
        { id: "z-chef", name: "Chef's Table (У открытой кухни)", is_vip: false, deposit_per_guest: 10000, deposit_per_table: 0 },
        { id: "z-vip", name: "VIP-кабинет", is_vip: true, deposit_per_guest: 0, deposit_per_table: 50000 }
      ],

      tables: [
        { id: "T1", number: 1, label: "Стол №1", zone_id: "z-main", seats: 2 },
        { id: "T2", number: 2, label: "Стол №2", zone_id: "z-main", seats: 2 },
        { id: "T3", number: 3, label: "Стол №3", zone_id: "z-main", seats: 4 },
        { id: "T4", number: 4, label: "Стол №4", zone_id: "z-main", seats: 4 },
        { id: "T5", number: 5, label: "Стол №5", zone_id: "z-main", seats: 6 },
        { id: "T6", number: 6, label: "Стол №6 (Терраса)", zone_id: "z-terrace", seats: 2 },
        { id: "T7", number: 7, label: "Стол №7 (Терраса)", zone_id: "z-terrace", seats: 4 },
        { id: "T8", number: 8, label: "Стол №8 (Терраса)", zone_id: "z-terrace", seats: 4 },
        { id: "T9", number: 9, label: "Стол №9 (Chef's)", zone_id: "z-chef", seats: 6 },
        { id: "T10", number: 10, label: "Стол №10 (VIP)", zone_id: "z-vip", seats: 10 }
      ],

      categories: [
        { id: "cat-steaks", name: "Стейки и Гриль" },
        { id: "cat-mains", name: "Горячее и Паста" },
        { id: "cat-starters", name: "Закуски и Салаты" },
        { id: "cat-sides", name: "Гарниры" },
        { id: "cat-desserts", name: "Десерты" },
        { id: "cat-drinks", name: "Напитки" }
      ],

      dishes: [
        {
          id: "d-ribeye", category_id: "cat-steaks", title: "Стейк Рибай Prime на углях",
          badge: "Хит",
          description: "Мраморная говядина зернового откорма на гриле со сливочным маслом и печёным чесноком.",
          composition: "Рибай Prime, сливочное масло, чеснок, розмарин, морская соль",
          price: 16000, weight: "350 г", kcal: 860, protein: 62, fat: 68, carbs: 2,
          allergens: ["lactose"], has_doneness: true,
          removable: ["лук", "печёный чеснок", "сливочное масло", "розмарин"],
          upsell: ["d-fries", "d-lemonade"], cook_time: 18, in_stock: true,
          image: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-filet", category_id: "cat-steaks", title: "Филе-миньон с трюфельным соусом",
          badge: "Выбор Шефа",
          description: "Нежнейший стейк из центральной вырезки с соусом демиглас.",
          composition: "Говяжья вырезка, соус демиглас, тимьян, масло",
          price: 14000, weight: "240 г", kcal: 510, protein: 48, fat: 32, carbs: 4,
          allergens: ["lactose"], has_doneness: true,
          removable: ["соус демиглас", "сливочное масло", "тимьян"],
          upsell: ["d-puree", "d-lemonade"], cook_time: 16, in_stock: true,
          image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-salmon", category_id: "cat-mains", title: "Лосось на гриле со спаржей",
          badge: "Новинка",
          description: "Филе охлаждённого лосося с зелёной спаржей и сливочно-лимонным соусом.",
          composition: "Филе лосося, спаржа, сливки 33%, лимон",
          price: 9200, weight: "270 г", kcal: 540, protein: 38, fat: 34, carbs: 12,
          allergens: ["fish", "lactose"], has_doneness: false,
          removable: ["сливочный соус", "лимон"],
          upsell: ["d-puree", "d-lemonade"], cook_time: 15, in_stock: true,
          image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-pasta", category_id: "cat-mains", title: "Феттуччине с тигровыми креветками",
          badge: "Хит",
          description: "Домашняя паста в сливочном соусе с тигровыми креветками и белыми грибами.",
          composition: "Паста феттуччине, креветки, белые грибы, сливки, пармезан, лук, чеснок",
          price: 7600, weight: "310 г", kcal: 610, protein: 32, fat: 26, carbs: 58,
          allergens: ["gluten", "shellfish", "lactose", "eggs"], has_doneness: false,
          removable: ["лук", "чеснок", "пармезан", "зелень"],
          upsell: ["d-lemonade"], cook_time: 14, in_stock: true,
          image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-burrata", category_id: "cat-starters", title: "Буррата с томатами и песто",
          badge: "",
          description: "Сливочная буррата со спелыми узбекскими томатами и базиликовым песто.",
          composition: "Сыр буррата, томаты, базилик, оливковое масло, кедровый орех",
          price: 5800, weight: "230 г", kcal: 390, protein: 17, fat: 30, carbs: 10,
          allergens: ["lactose", "nuts"], has_doneness: false,
          removable: ["соус песто (орехи)", "красный лук", "базилик"],
          upsell: ["d-lemonade"], cook_time: 7, in_stock: true,
          image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-tartare", category_id: "cat-starters", title: "Тартар из говядины с бриошью",
          badge: "",
          description: "Рубленая мраморная вырезка с каперсами, шалотом и тёплой бриошью.",
          composition: "Говяжья вырезка, лук шалот, каперсы, желток, бриошь",
          price: 6400, weight: "190 г", kcal: 370, protein: 25, fat: 22, carbs: 14,
          allergens: ["gluten", "eggs"], has_doneness: false,
          removable: ["лук шалот", "каперсы", "горчица"],
          upsell: ["d-fries"], cook_time: 10, in_stock: true,
          image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-fries", category_id: "cat-sides", title: "Картофель фри с трюфелем и пармезаном",
          badge: "",
          description: "Хрустящий картофель с трюфельным маслом и тёртым пармезаном.",
          composition: "Картофель, трюфельное масло, пармезан",
          price: 2200, weight: "160 г", kcal: 380, protein: 6, fat: 18, carbs: 46,
          allergens: ["lactose"], has_doneness: false,
          removable: ["пармезан", "трюфельное масло"],
          upsell: [], cook_time: 7, in_stock: true,
          image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-puree", category_id: "cat-sides", title: "Сливочное картофельное пюре",
          badge: "",
          description: "Бархатное картофельное пюре на фермерском молоке и сливочном масле.",
          composition: "Картофель, сливочное масло, молоко",
          price: 1800, weight: "180 г", kcal: 250, protein: 4, fat: 12, carbs: 32,
          allergens: ["lactose"], has_doneness: false,
          removable: ["зелень"],
          upsell: [], cook_time: 5, in_stock: true,
          image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-fondant", category_id: "cat-desserts", title: "Шоколадный фондан с пломбиром",
          badge: "Хит",
          description: "Горячий шоколадный кекс с жидким центром и шариком ванильного мороженого.",
          composition: "Тёмный шоколад 70%, масло, яйца, мука, пломбир",
          price: 3400, weight: "150 г", kcal: 460, protein: 8, fat: 28, carbs: 44,
          allergens: ["gluten", "lactose", "eggs"], has_doneness: false,
          removable: ["шарик мороженого"],
          upsell: ["d-coffee"], cook_time: 12, in_stock: true,
          image: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-cheesecake", category_id: "cat-desserts", title: "Фисташковый чизкейк Сан-Себастьян",
          badge: "",
          description: "Кремовый чизкейк с натуральной пастой из сицилийской фисташки.",
          composition: "Сливочный сыр, сливки, фисташка, яйца",
          price: 3200, weight: "160 г", kcal: 440, protein: 9, fat: 27, carbs: 36,
          allergens: ["lactose", "nuts", "eggs"], has_doneness: false,
          removable: ["дроблёная фисташка"],
          upsell: ["d-coffee"], cook_time: 5, in_stock: true,
          image: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-lemonade", category_id: "cat-drinks", title: "Лимонад Манго — Маракуйя",
          badge: "",
          description: "Освежающий домашний лимонад из спелого манго, маракуйи и мяты.",
          composition: "Пюре манго, маракуйя, мята, лайм, содовая",
          price: 1800, weight: "400 мл", kcal: 110, protein: 1, fat: 0, carbs: 26,
          allergens: [], has_doneness: false,
          removable: ["лёд", "мята"],
          upsell: [], cook_time: 3, in_stock: true,
          image: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80"
        },
        {
          id: "d-coffee", category_id: "cat-drinks", title: "Капучино Спешелти Арабика",
          badge: "",
          description: "Двойной эспрессо со взбитым фермерским молоком.",
          composition: "Зерновой кофе 100% Арабика, молоко",
          price: 1400, weight: "250 мл", kcal: 120, protein: 6, fat: 5, carbs: 9,
          allergens: ["lactose"], has_doneness: false,
          removable: ["корица"],
          upsell: ["d-fondant"], cook_time: 3, in_stock: true,
          image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80"
        }
      ],

      ingredients: [
        { id: "ing-ribeye", name: "Мраморная говядина Рибай", unit: "кг", stock_qty: 18.5, cost_per_unit: 11000, min_qty: 5 },
        { id: "ing-tender", name: "Говяжья вырезка Prime", unit: "кг", stock_qty: 12.0, cost_per_unit: 13000, min_qty: 4 },
        { id: "ing-salmon", name: "Филе лосося охлаждённое", unit: "кг", stock_qty: 9.5, cost_per_unit: 8500, min_qty: 3 },
        { id: "ing-shrimp", name: "Тигровые креветки", unit: "кг", stock_qty: 6.2, cost_per_unit: 9500, min_qty: 2 },
        { id: "ing-burrata", name: "Сыр Буррата фермерский", unit: "шт", stock_qty: 24, cost_per_unit: 1600, min_qty: 8 },
        { id: "ing-tomato", name: "Томаты узбекские", unit: "кг", stock_qty: 11.0, cost_per_unit: 1800, min_qty: 3 },
        { id: "ing-pasta", name: "Паста и мука твёрдых сортов", unit: "кг", stock_qty: 15.0, cost_per_unit: 1400, min_qty: 4 },
        { id: "ing-potato", name: "Картофель отборный", unit: "кг", stock_qty: 40.0, cost_per_unit: 350, min_qty: 10 },
        { id: "ing-veg", name: "Спаржа и свежие овощи", unit: "кг", stock_qty: 14.0, cost_per_unit: 2200, min_qty: 4 },
        { id: "ing-cream", name: "Сливки, масло и крем-чиз", unit: "кг", stock_qty: 12.5, cost_per_unit: 3400, min_qty: 3 },
        { id: "ing-choc", name: "Шоколад бельгийский 70%", unit: "кг", stock_qty: 5.0, cost_per_unit: 9000, min_qty: 1.5 },
        { id: "ing-pistachio", name: "Паста фисташковая", unit: "кг", stock_qty: 2.5, cost_per_unit: 14000, min_qty: 1 },
        { id: "ing-fruit", name: "Пюре манго и маракуйя", unit: "кг", stock_qty: 8.0, cost_per_unit: 2600, min_qty: 2 },
        { id: "ing-coffee", name: "Кофе зерновой Спешелти", unit: "кг", stock_qty: 6.0, cost_per_unit: 9500, min_qty: 1.5 }
      ],

      tech_cards: [
        { dish_id: "d-ribeye", ingredient_id: "ing-ribeye", qty: 0.38 }, { dish_id: "d-ribeye", ingredient_id: "ing-cream", qty: 0.04 },
        { dish_id: "d-filet", ingredient_id: "ing-tender", qty: 0.26 }, { dish_id: "d-filet", ingredient_id: "ing-cream", qty: 0.04 },
        { dish_id: "d-burrata", ingredient_id: "ing-burrata", qty: 1 }, { dish_id: "d-burrata", ingredient_id: "ing-tomato", qty: 0.14 },
        { dish_id: "d-tartare", ingredient_id: "ing-tender", qty: 0.16 },
        { dish_id: "d-salmon", ingredient_id: "ing-salmon", qty: 0.22 }, { dish_id: "d-salmon", ingredient_id: "ing-veg", qty: 0.08 }, { dish_id: "d-salmon", ingredient_id: "ing-cream", qty: 0.05 },
        { dish_id: "d-pasta", ingredient_id: "ing-pasta", qty: 0.15 }, { dish_id: "d-pasta", ingredient_id: "ing-shrimp", qty: 0.14 }, { dish_id: "d-pasta", ingredient_id: "ing-cream", qty: 0.08 },
        { dish_id: "d-fries", ingredient_id: "ing-potato", qty: 0.25 },
        { dish_id: "d-puree", ingredient_id: "ing-potato", qty: 0.25 }, { dish_id: "d-puree", ingredient_id: "ing-cream", qty: 0.05 },
        { dish_id: "d-fondant", ingredient_id: "ing-choc", qty: 0.08 }, { dish_id: "d-fondant", ingredient_id: "ing-cream", qty: 0.06 },
        { dish_id: "d-cheesecake", ingredient_id: "ing-cream", qty: 0.14 }, { dish_id: "d-cheesecake", ingredient_id: "ing-pistachio", qty: 0.03 },
        { dish_id: "d-lemonade", ingredient_id: "ing-fruit", qty: 0.12 },
        { dish_id: "d-coffee", ingredient_id: "ing-coffee", qty: 0.02 }, { dish_id: "d-coffee", ingredient_id: "ing-cream", qty: 0.05 }
      ],

      supplies: [
        { id: "sup-101", invoice: "НКЛ-2026-081", supplier: "ТОО «KazBeef Prime» (Мраморная говядина и ягнёнок)", ingredient_id: "ing-ribeye", ingredient_name: "Мраморная говядина Рибай", qty: 10, unit: "кг", unit_cost: 11000, total_cost: 110000, date: today, accepted_by: "Мадина Касымова (Бухгалтер)" },
        { id: "sup-102", invoice: "НКЛ-2026-082", supplier: "«Ocean & Fjords KZ» (Охлаждённый лосось и креветки)", ingredient_id: "ing-salmon", ingredient_name: "Филе лосося охлаждённое", qty: 6, unit: "кг", unit_cost: 8500, total_cost: 51000, date: today, accepted_by: "Мадина Касымова (Бухгалтер)" },
        { id: "sup-103", invoice: "НКЛ-2026-083", supplier: "ТОО «Italia Gastro Import» (Сыры, паста, мука, масло)", ingredient_id: "ing-burrata", ingredient_name: "Сыр Буррата фермерский", qty: 20, unit: "шт", unit_cost: 1600, total_cost: 32000, date: today, accepted_by: "Мадина Касымова (Бухгалтер)" }
      ],

      expenses: [
        { id: "exp-1", category: "Закупка продуктов (Поставки)", title: "Оплата поставщику ТОО «KazBeef Prime» по накладной НКЛ-2026-081 (Рибай 10 кг)", amount: 110000, recipient: "ТОО «KazBeef Prime»", date: today },
        { id: "exp-2", category: "Закупка продуктов (Поставки)", title: "Оплата поставщику «Ocean & Fjords KZ» по накладной НКЛ-2026-082 (Лосось 6 кг)", amount: 51000, recipient: "«Ocean & Fjords KZ»", date: today },
        { id: "exp-3", category: "Закупка продуктов (Поставки)", title: "Оплата поставщику ТОО «Italia Gastro Import» по накладной НКЛ-2026-083 (Буррата 20 шт)", amount: 32000, recipient: "ТОО «Italia Gastro Import»", date: today },
        { id: "exp-4", category: "Аренда и коммунальные платежи", title: "Суточная часть аренды помещения и электроэнергии", amount: 45000, recipient: "БЦ «Dostyk Plaza»", date: today },
        { id: "exp-5", category: "Банковский эквайринг и сервис", title: "Комиссия банковского эквайринга Kaspi Pay / Halyk POS (1.8%)", amount: 14500, recipient: "АО «Kaspi Bank»", date: today }
      ],

      reservations: [
        {
          id: "res-1", code: "BR-501", guest_id: "u-guest-1", session_id: "seed-aliya",
          guest_name: "Алия Сатпаева", guest_phone: "+7 701 555 01 01",
          table_id: "T2", visit_date: tomorrow, visit_time: "19:30", guests_count: 2, comment: "У окна",
          preorder: [
            { dish_id: "d-ribeye", title: "Стейк Рибай Prime на углях", price: 16000, qty: 1, options: "Medium Rare" },
            { dish_id: "d-burrata", title: "Буррата с томатами и песто", price: 5800, qty: 1, options: "" }
          ],
          preorder_total: 21800, deposit_amount: 10900,
          deposit_rule: "Предоплата 50% от стоимости предзаказанных блюд (21 800 ₸ × 50%)",
          deposit_status: "paid", status: "confirmed", refund_amount: 0,
          created_at: new Date(Date.now() - 3600000 * 4).toISOString()
        },
        {
          id: "res-2", code: "BR-502", guest_id: "u-other-guest", session_id: "seed-timur",
          guest_name: "Тимур Бектуров", guest_phone: "+7 702 888 44 11",
          table_id: "T4", visit_date: today, visit_time: "20:00", guests_count: 4, comment: "Деловой ужин",
          preorder: [
            { dish_id: "d-filet", title: "Филе-миньон с трюфельным соусом", price: 14000, qty: 2, options: "Medium" }
          ],
          preorder_total: 28000, deposit_amount: 14000,
          deposit_rule: "Предоплата 50% от стоимости предзаказанных блюд (28 000 ₸ × 50%)",
          deposit_status: "paid", status: "confirmed", refund_amount: 0,
          created_at: new Date(Date.now() - 3600000 * 2).toISOString()
        }
      ],

      orders: [
        { id: "ord-100", number: "25", code: "25-1", table_id: "T3", guest_id: "u-guest-1", session_id: "seed-aliya", guest_name: "Алия Сатпаева", waiter_id: "u-waiter", status: "open", subtotal: 31200, deposit_applied: 10000, bonus_used: 0, total: 21200, paid_amount: 0, created_at: new Date(Date.now() - 20 * 60000).toISOString() },
        { id: "ord-099", number: "24", code: "24-1", table_id: "T5", guest_id: "u-other-guest-2", session_id: "seed-kairat", guest_name: "Кайрат Нурпеисов", waiter_id: "u-waiter", status: "paid", subtotal: 185000, deposit_applied: 50000, bonus_used: 0, total: 135000, paid_amount: 135000, created_at: new Date(Date.now() - 180 * 60000).toISOString() },
        { id: "ord-098", number: "23", code: "23-1", table_id: "T9", guest_id: "u-other-guest-3", session_id: "seed-dinara", guest_name: "Динара Ахметова", waiter_id: "u-waiter", status: "paid", subtotal: 96000, deposit_applied: 25000, bonus_used: 0, total: 71000, paid_amount: 71000, created_at: new Date(Date.now() - 240 * 60000).toISOString() }
      ],

      order_items: [
        { id: "item-1", order_id: "ord-100", order_num: "25", table_id: "T3", dish_id: "d-burrata", title: "Буррата с томатами и песто", price: 5800, qty: 1, mods: "⊖ Без красного лука", status: "served", norm_min: 7, cook_id: "u-chef", refunded: false, created_at: new Date(Date.now() - 18 * 60000).toISOString(), started_at: new Date(Date.now() - 17 * 60000).toISOString() },
        { id: "item-2", order_id: "ord-100", order_num: "25", table_id: "T3", dish_id: "d-ribeye", title: "Стейк Рибай Prime на углях", price: 16000, qty: 1, mods: "Medium Rare · ⊖ Без чеснока", status: "cooking", norm_min: 18, cook_id: "u-chef", refunded: false, created_at: new Date(Date.now() - 11 * 60000).toISOString(), started_at: new Date(Date.now() - 9 * 60000).toISOString() },
        { id: "item-3", order_id: "ord-100", order_num: "25", table_id: "T3", dish_id: "d-pasta", title: "Феттуччине с тигровыми креветками", price: 7600, qty: 1, mods: "⊖ Без лука", status: "accepted", norm_min: 14, cook_id: "u-cook2", refunded: false, created_at: new Date(Date.now() - 4 * 60000).toISOString() },
        { id: "item-4", order_id: "ord-100", order_num: "25", table_id: "T3", dish_id: "d-lemonade", title: "Лимонад Манго — Маракуйя", price: 1800, qty: 1, mods: "Меньше льда", status: "ready", norm_min: 3, cook_id: "u-chef", refunded: false, created_at: new Date(Date.now() - 6 * 60000).toISOString(), started_at: new Date(Date.now() - 5 * 60000).toISOString() }
      ],

      transactions: [
        { id: "tx-101", direction: "in", type: "order", title: "Оплата заказа 24-1 (Стол №5)", amount: 185000, method: "Карта / Kaspi QR", created_at: new Date(Date.now() - 180 * 60000).toISOString() },
        { id: "tx-102", direction: "in", type: "order", title: "Оплата заказа 23-1 (Стол №9)", amount: 96000, method: "Банковская карта", created_at: new Date(Date.now() - 240 * 60000).toISOString() },
        { id: "tx-103", direction: "in", type: "deposit", title: "Предоплата 50% от заказанных блюд (Бронь BR-501)", amount: 10900, method: "Карта онлайн", created_at: new Date(Date.now() - 220 * 60000).toISOString() },
        { id: "tx-104", direction: "in", type: "deposit", title: "Предоплата 50% от заказанных блюд (Бронь BR-502)", amount: 14000, method: "Карта онлайн", created_at: new Date(Date.now() - 120 * 60000).toISOString() },
        { id: "tx-105", direction: "in", type: "deposit_forfeit", title: "Удержанный депозит при поздней отмене брони <24ч (Бронь BR-495)", amount: 15000, method: "Удержание депозита", created_at: new Date(Date.now() - 300 * 60000).toISOString() }
      ],

      write_offs: [
        { id: "wo-1", ingredient_id: "ing-ribeye", dish_title: "Стейк Рибай Prime (продажи)", qty: 3.8, unit: "кг", reason: "sale", cost: 41800, created_at: today },
        { id: "wo-2", ingredient_id: "ing-salmon", dish_title: "Лосось со спаржей (продажи)", qty: 1.8, unit: "кг", reason: "sale", cost: 15300, created_at: today },
        { id: "wo-3", ingredient_id: "ing-burrata", dish_title: "Буррата с томатами (продажи)", qty: 8, unit: "шт", reason: "sale", cost: 12800, created_at: today },
        { id: "wo-4", ingredient_id: "ing-shrimp", dish_title: "Списание брака (Сторно RET-101)", qty: 0.14, unit: "кг", reason: "complaint", cost: 1330, created_at: today }
      ],

      reviews: [
        { id: "rev-1", order_item_id: "item-1", dish_id: "d-burrata", dish_title: "Буррата с томатами и песто", cook_id: "u-chef", guest_id: "u-guest-1", rating: 5, tags: ["Идеально вкусно", "Быстрая подача"], comment: "Очень вкусно!", created_at: new Date(Date.now() - 10 * 60000).toISOString() },
        { id: "rev-2", order_item_id: null, dish_id: "d-ribeye", dish_title: "Стейк Рибай Prime на углях", cook_id: "u-chef", guest_id: "u-other", rating: 5, tags: ["Идеально вкусно", "Горячее и свежее"], comment: "Прожарка супер.", created_at: new Date(Date.now() - 120 * 60000).toISOString() }
      ],

      complaints: [
        { id: "cmp-101", code: "RET-101", order_item_id: null, table_id: "T5", dish_id: "d-pasta", dish_title: "Феттуччине с тигровыми креветками", cook_id: "u-cook2", guest_id: "u-other-guest-2", guest_name: "Гость Стола №5", reason: "Блюдо подали холодным / остывшим", description: "Долго несли с тепловой полки.", photo_url: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?auto=format&fit=crop&w=500&q=70", amount: 7600, preferred: "refund", status: "open", resolution_note: "", created_at: new Date(Date.now() - 15 * 60000).toISOString() }
      ],

      service_calls: [
        { id: "call-1", table_id: "T3", type: "waiter", message: "Стол №3 вызывает официанта", status: "new", created_at: new Date(Date.now() - 3 * 60000).toISOString() }
      ],

      shifts: [
        { id: "sh-1", staff_id: "u-chef", hours: 10, bonus: 5000, penalty: 0 },
        { id: "sh-2", staff_id: "u-cook2", hours: 10, bonus: 0, penalty: 2000 },
        { id: "sh-3", staff_id: "u-waiter", hours: 11, bonus: 4000, penalty: 0 },
        { id: "sh-4", staff_id: "u-acc", hours: 8, bonus: 0, penalty: 0 },
        { id: "sh-5", staff_id: "u-boss", hours: 8, bonus: 0, penalty: 0 }
      ],

      loyalty_log: [
        { id: "loy-1", guest_id: "u-guest-1", amount: 2000, reason: "Приветственные бонусы", date: today },
        { id: "loy-2", guest_id: "u-guest-1", amount: 2500, reason: "Кэшбэк 5% за визит", date: today }
      ],

      // Привязанные экранные устройства по 4-значному коду (как в Dodo IS "Устройства" -> код 5237)
      devices: [
        { id: "dev-1", code: "5237", name: "Экран KDS №1 — Горячий цех / Раскатка", role: "cook", status: "active" },
        { id: "dev-2", code: "9982", name: "Табло Готовности в зале", role: "tracker", status: "active" }
      ],

      happy_hour_enabled: false,
      happy_hour_pct: 15
    };
  }

  class LaurumCoreEngine {
    constructor() {
      this.mode = "local";
      this.supabase = null;
      this.state = buildSeedData();
      this.listeners = new Set();
      this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("laurum_two_sites_sync") : null;
      this.pollTimer = null;
      this.init();
    }

    init() {
      this.loadLocal();
      window.addEventListener("storage", (e) => {
        if (e.key === STORAGE_KEY) {
          this.loadLocal();
          this.notify();
        }
      });
      if (this.channel) {
        this.channel.onmessage = () => {
          this.loadLocal();
          this.notify();
        };
      }
      this.tryConnectSupabase();
    }

    getSupabaseCredentials() {
      const cfg = window.LAURUM_CONFIG || {};
      let url = cfg.SUPABASE_URL || "";
      let key = cfg.SUPABASE_ANON_KEY || DEFAULT_PUBLISHABLE_KEY;
      try {
        const saved = JSON.parse(localStorage.getItem("laurum_sb_creds") || "null");
        if (saved && saved.url) url = saved.url;
        if (saved && saved.key) key = saved.key;
      } catch (_) {}
      return { url: url.trim(), key: (key || DEFAULT_PUBLISHABLE_KEY).trim() };
    }

    async saveSupabaseCredentials(url, key) {
      localStorage.setItem(
        "laurum_sb_creds",
        JSON.stringify({
          url: (url || "").trim(),
          key: (key || DEFAULT_PUBLISHABLE_KEY).trim()
        })
      );
      await this.tryConnectSupabase();
      this.notify();
    }

    async tryConnectSupabase() {
      const { url, key } = this.getSupabaseCredentials();
      if (!url || !key || url.includes("TODO") || !url.startsWith("http") || !navigator.onLine) {
        this.mode = "local";
        return false;
      }
      try {
        const mod = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
        this.supabase = mod.createClient(url, key);
        this.mode = "supabase";
        await this.pullFromSupabase();
        this.supabase
          .channel("laurum-shared-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "laurum_shared_state" },
            (payload) => {
              if (payload.new && payload.new.payload) {
                this.state = { ...buildSeedData(), ...payload.new.payload };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
                this.notify();
              }
            }
          )
          .subscribe();
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
          if (!document.hidden) this.pullFromSupabase();
        }, 3000);
        this.notify();
        return true;
      } catch (e) {
        this.mode = "local";
        return false;
      }
    }

    async pullFromSupabase() {
      if (!this.supabase) return;
      try {
        const { data, error } = await this.supabase
          .from("laurum_shared_state")
          .select("*")
          .eq("id", "main")
          .maybeSingle();
        if (!error && data && data.payload && Object.keys(data.payload).length > 0) {
          const remoteTs = new Date(data.payload.updated_at || 0).getTime();
          const localTs = new Date(this.state.updated_at || 0).getTime();
          if (remoteTs >= localTs) {
            this.state = { ...buildSeedData(), ...data.payload };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            this.notify();
          }
        } else if (!error && !data) {
          await this.pushToSupabase();
        }
      } catch (_) {}
    }

    async pushToSupabase() {
      if (!this.supabase || this.mode !== "supabase") return;
      try {
        await this.supabase.from("laurum_shared_state").upsert({
          id: "main",
          payload: this.state,
          updated_at: this.state.updated_at
        });
      } catch (_) {}
    }

    loadLocal() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.state = { ...buildSeedData(), ...JSON.parse(raw) };
        } else {
          this.state = buildSeedData();
          this.saveLocal(false);
        }
      } catch (_) {
        this.state = buildSeedData();
      }
    }

    saveLocal(broadcast = true) {
      this.state.updated_at = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      if (broadcast && this.channel) {
        this.channel.postMessage({ updated: Date.now() });
      }
      if (this.mode === "supabase") {
        this.pushToSupabase();
      }
      this.notify();
    }

    resetAllDemoData() {
      this.state = buildSeedData();
      this.saveLocal(true);
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    notify() {
      for (const fn of this.listeners) fn(this.state);
    }

    // =========================================================================
    // СТРОГАЯ ПРИВАТНАЯ АВТОРИЗАЦИЯ ГОСТЯ (ГОСТЬ ВИДИТ ТОЛЬКО СВОИ БРОНИ И ЗАКАЗЫ!)
    // =========================================================================
    getLoggedInGuest() {
      const id = localStorage.getItem("laurum_logged_guest_uid");
      if (!id) return null;
      return this.state.profiles.find((p) => p.id === id && p.role === "guest") || null;
    }

    loginOrRegisterGuest({ phone, full_name, sms_code }) {
      const cleanPhone = (phone || "").trim();
      if (!cleanPhone) throw new Error("Введите номер телефона");
      const digits = cleanPhone.replace(/\D/g, "");
      if (digits.length < 6) throw new Error("Введите корректный номер телефона");

      let g = this.state.profiles.find(
        (p) => p.role === "guest" && p.phone && p.phone.replace(/\D/g, "") === digits
      );
      let isNew = false;

      if (!g) {
        isNew = true;
        g = {
          id: uid("u-guest"),
          full_name: (full_name || "Гость").trim(),
          role: "guest",
          login: null,
          password: "",
          phone: cleanPhone,
          hourly_rate: 0,
          bonus_balance: 2000,
          is_active: true
        };
        this.state.profiles.push(g);
        this.state.loyalty_log.unshift({
          id: uid("loy"),
          guest_id: g.id,
          amount: 2000,
          reason: "Приветственные 2 000 додокоинов/бонусов за регистрацию",
          date: dateOffset(0)
        });
      } else if (full_name && full_name.trim()) {
        g.full_name = full_name.trim();
      }

      // Привязываем все заказы и брони текущей анонимной сессии к этому гостю
      const anonSid = getAnonSessionId();
      this.state.reservations.forEach((r) => {
        if (r.session_id === anonSid && !r.guest_id) r.guest_id = g.id;
      });
      this.state.orders.forEach((o) => {
        if (o.session_id === anonSid && !o.guest_id) o.guest_id = g.id;
      });

      localStorage.setItem("laurum_logged_guest_uid", g.id);
      this.saveLocal(true);
      return { guest: g, isNew };
    }

    logoutGuest() {
      localStorage.removeItem("laurum_logged_guest_uid");
      sessionStorage.removeItem(SESSION_ID_KEY);
      this.notify();
    }

    // Возвращает ТОЛЬКО собственные брони текущего гостя (чужие брони скрыты!)
    getMyReservations() {
      const guest = this.getLoggedInGuest();
      const sid = getAnonSessionId();
      return this.state.reservations.filter((r) => {
        if (guest && r.guest_id === guest.id) return true;
        if (r.session_id && r.session_id === sid) return true;
        return false;
      });
    }

    // Возвращает ТОЛЬКО собственные заказы текущего гостя (чужие заказы скрыты!)
    getMyOrders() {
      const guest = this.getLoggedInGuest();
      const sid = getAnonSessionId();
      return this.state.orders.filter((o) => {
        if (guest && o.guest_id === guest.id) return true;
        if (o.session_id && o.session_id === sid) return true;
        return false;
      });
    }

    // =========================================================================
    // СТРОГАЯ РОЛЕВАЯ АВТОРИЗАЦИЯ СОТРУДНИКОВ (КАЖДЫЙ ВИДИТ ТОЛЬКО СВОЙ ИНТЕРФЕЙС!)
    // =========================================================================
    getLoggedInStaff() {
      const id = sessionStorage.getItem("laurum_logged_staff_uid") || localStorage.getItem("laurum_logged_staff_uid");
      if (!id) return null;
      return this.state.profiles.find((p) => p.id === id && p.role !== "guest" && p.is_active) || null;
    }

    loginStaff(login, password) {
      const clean = (login || "").trim().toLowerCase();
      const staff = this.state.profiles.find(
        (p) => p.role !== "guest" && p.is_active && p.login && p.login.toLowerCase() === clean
      );
      if (!staff) throw new Error("Сотрудник с таким логином не найден. Аккаунты создаёт только Босс.");
      if (staff.password && staff.password !== password) throw new Error("Неверный пароль.");
      sessionStorage.setItem("laurum_logged_staff_uid", staff.id);
      localStorage.setItem("laurum_logged_staff_uid", staff.id);
      this.notify();
      return staff;
    }

    // Вход экранного устройства кухни по 4-значному коду (как в Dodo IS "5237")
    loginByDeviceCode(code4) {
      const dev = (this.state.devices || []).find((d) => d.code === (code4 || "").trim());
      if (!dev) throw new Error("Код устройства не найден. Проверьте 4-значный код в разделе «Устройства» у Босса.");
      const cook = this.state.profiles.find((p) => p.role === "cook" && p.is_active);
      if (cook) {
        sessionStorage.setItem("laurum_logged_staff_uid", cook.id);
        localStorage.setItem("laurum_logged_staff_uid", cook.id);
        this.notify();
        return { staff: cook, device: dev };
      }
      throw new Error("Нет активного аккаунта повара");
    }

    registerNewDeviceByBoss(code4, name) {
      if (!this.state.devices) this.state.devices = [];
      const dev = {
        id: uid("dev"),
        code: (code4 || "").trim(),
        name: (name || "Экран KDS Кухни").trim(),
        role: "cook",
        status: "active"
      };
      this.state.devices.unshift(dev);
      this.saveLocal(true);
      return dev;
    }

    logoutStaff() {
      sessionStorage.removeItem("laurum_logged_staff_uid");
      localStorage.removeItem("laurum_logged_staff_uid");
      this.notify();
    }

    createStaffByBoss({ full_name, role, login, password, phone, hourly_rate }) {
      const cleanLogin = (login || "").trim().toLowerCase();
      if (!cleanLogin || !password) throw new Error("Заполните логин и пароль сотрудника");
      if (this.state.profiles.some((p) => p.login && p.login.toLowerCase() === cleanLogin)) {
        throw new Error("Логин «" + cleanLogin + "» уже занят");
      }
      const staff = {
        id: uid("u-staff"),
        full_name: full_name.trim(),
        role: role || "waiter",
        login: cleanLogin,
        password: password.trim(),
        phone: (phone || "+7 701 000 00 00").trim(),
        hourly_rate: Number(hourly_rate || 3000),
        bonus_balance: 0,
        is_active: true
      };
      this.state.profiles.push(staff);
      this.state.shifts.push({ id: uid("sh"), staff_id: staff.id, hours: 8, bonus: 0, penalty: 0 });
      this.saveLocal(true);
      return staff;
    }

    // =========================================================================
    // МЕНЮ, ТЕХКАРТЫ, СТАТУС СТОЛОВ (БЕЗ УТЕЧКИ ЧУЖИХ ДАННЫХ ДЛЯ ГОСТЯ)
    // =========================================================================
    getDishPrice(dish) {
      if (this.state.happy_hour_enabled) {
        const pct = this.state.happy_hour_pct || 15;
        return { price: Math.round((dish.price * (100 - pct)) / 100), oldPrice: dish.price, discountPct: pct };
      }
      return { price: dish.price, oldPrice: null, discountPct: 0 };
    }

    toggleHappyHour() {
      this.state.happy_hour_enabled = !this.state.happy_hour_enabled;
      this.saveLocal(true);
      return this.state.happy_hour_enabled;
    }

    getDishCostAndMargin(dishId) {
      const dish = this.state.dishes.find((d) => d.id === dishId);
      const rows = this.state.tech_cards.filter((tc) => tc.dish_id === dishId);
      let cost = 0;
      const items = rows.map((tc) => {
        const ing = this.state.ingredients.find((i) => i.id === tc.ingredient_id);
        const lineCost = ing ? Math.round(tc.qty * ing.cost_per_unit) : 0;
        cost += lineCost;
        return { name: ing ? ing.name : tc.ingredient_id, qty: tc.qty, unit: ing ? ing.unit : "", lineCost };
      });
      const price = dish ? dish.price : 0;
      const margin = price - cost;
      const foodCostPct = price > 0 ? Math.round((cost / price) * 100) : 0;
      return { cost, price, margin, foodCostPct, marginPct: price > 0 ? 100 - foodCostPct : 0, items };
    }

    // Статус стола: для гостя возвращается ТОЛЬКО «Свободен» или «Занят» (без чужих имён!),
    // а если стол забронирован САМИМ этим гостем — помечается «Ваша бронь»!
    getTableStatusForGuest(tableId) {
      const myRes = this.getMyReservations().find((r) => r.table_id === tableId && r.status === "confirmed");
      if (myRes) return { status: "my_booking", label: "Ваша бронь", isFree: false };

      const myOrd = this.getMyOrders().find((o) => o.table_id === tableId && o.status === "open");
      if (myOrd) return { status: "my_table", label: "Ваш стол", isFree: false };

      const anyOpenOrder = this.state.orders.find((o) => o.table_id === tableId && o.status === "open");
      const anyActiveRes = this.state.reservations.find((r) => r.table_id === tableId && r.status === "confirmed");
      if (anyOpenOrder || anyActiveRes) {
        return { status: "busy", label: "Занят", isFree: false };
      }
      return { status: "free", label: "Свободен", isFree: true };
    }

    // Статус стола для персонала (Официант / Хостес видит полную информацию)
    getTableLiveStatus(tableId) {
      const openOrder = this.state.orders.find((o) => o.table_id === tableId && o.status === "open");
      if (openOrder) return { status: "occupied", label: "Гости за столом", order: openOrder, reservation: null };
      const activeRes = this.state.reservations.find((r) => r.table_id === tableId && r.status === "confirmed");
      if (activeRes) return { status: "reserved", label: "Бронь с предоплатой", order: null, reservation: activeRes };
      return { status: "free", label: "Свободен", order: null, reservation: null };
    }

    calculatePrepayment({ tableId, guestsCount, cartItems }) {
      const table = this.state.tables.find((t) => t.id === tableId) || this.state.tables[0];
      const zone = this.state.zones.find((z) => z.id === table.zone_id) || this.state.zones[0];
      const foodTotal = (cartItems || []).reduce((s, i) => s + i.price * i.qty, 0);
      const prepay50 = Math.round(foodTotal * 0.5);
      const fallbackDeposit = zone.is_vip ? zone.deposit_per_table : zone.deposit_per_guest * Number(guestsCount || 2);
      const depositAmount = foodTotal > 0 ? prepay50 : fallbackDeposit;
      const explanation =
        foodTotal > 0
          ? `50% от стоимости заказанных блюд (${fmt(foodTotal)} × 50% = ${fmt(prepay50)})`
          : zone.is_vip
          ? `Депозит за VIP-кабинет (${fmt(fallbackDeposit)})`
          : `Депозит ${fmt(zone.deposit_per_guest)} × ${guestsCount} гост. (без предзаказа блюд)`;
      return { foodTotal, prepay50, fallbackDeposit, depositAmount, explanation, table, zone };
    }

    createReservation({ guest_name, guest_phone, table_id, visit_date, visit_time, guests_count, comment, cartItems }) {
      const tblCheck = this.getTableStatusForGuest(table_id);
      if (!tblCheck.isFree) {
        throw new Error("Этот стол уже занят. Пожалуйста, выберите другой свободный стол (зелёный).");
      }
      const calc = this.calculatePrepayment({ tableId: table_id, guestsCount: guests_count, cartItems });
      const guest = this.getLoggedInGuest();
      const sid = getAnonSessionId();

      const res = {
        id: uid("res"),
        code: "BR-" + Math.floor(100 + Math.random() * 900),
        guest_id: guest ? guest.id : null,
        session_id: sid,
        guest_name: (guest_name || (guest ? guest.full_name : "Гость")).trim(),
        guest_phone: (guest_phone || (guest ? guest.phone : "")).trim(),
        table_id,
        visit_date,
        visit_time,
        guests_count: Number(guests_count),
        comment: (comment || "").trim(),
        preorder: (cartItems || []).map((i) => ({
          dish_id: i.dish_id,
          title: i.title,
          price: i.price,
          qty: i.qty,
          options: i.mods || ""
        })),
        preorder_total: calc.foodTotal,
        deposit_amount: calc.depositAmount,
        deposit_rule: calc.explanation,
        deposit_status: "paid",
        status: "confirmed",
        refund_amount: 0,
        created_at: new Date().toISOString()
      };

      this.state.reservations.unshift(res);
      this.state.transactions.unshift({
        id: uid("tx"),
        direction: "in",
        type: "deposit",
        title: `Предоплата брони ${res.code} (${calc.table.label}) — ${calc.explanation}`,
        amount: calc.depositAmount,
        method: "Карта онлайн",
        created_at: new Date().toISOString()
      });

      this.saveLocal(true);
      return res;
    }

    cancelReservation(resId, forceLateDemo = null) {
      const res = this.state.reservations.find((r) => r.id === resId);
      if (!res || res.status !== "confirmed") return null;
      const visitTs = new Date(`${res.visit_date}T${res.visit_time}:00`).getTime();
      const hoursLeft = (visitTs - Date.now()) / 3600000;
      const isFullRefund = forceLateDemo === null ? hoursLeft >= 24 : !forceLateDemo;
      res.status = "cancelled";
      if (isFullRefund) {
        res.deposit_status = "refunded";
        res.refund_amount = res.deposit_amount;
        this.state.expenses.unshift({
          id: uid("exp"),
          category: "Возвраты депозитов броней (отмена ≥24ч)",
          title: `100% возврат предоплаты по брони ${res.code} (отмена более чем за 24 часа)`,
          amount: res.deposit_amount,
          recipient: res.guest_name,
          date: dateOffset(0)
        });
      } else {
        res.deposit_status = "forfeited";
        res.refund_amount = 0;
        this.state.transactions.unshift({
          id: uid("tx"),
          direction: "in",
          type: "deposit_forfeit",
          title: `Удержание депозита брони ${res.code} (поздняя отмена менее чем за 24ч)`,
          amount: res.deposit_amount,
          method: "Удержание депозита",
          created_at: new Date().toISOString()
        });
      }
      this.saveLocal(true);
      return { res, isFullRefund };
    }

    seatGuestsByReservation(resId) {
      const res = this.state.reservations.find((r) => r.id === resId);
      if (!res) return null;
      res.status = "seated";
      res.deposit_status = "applied";
      const order = this.sendOrderToTable({
        table_id: res.table_id,
        guest_id: res.guest_id,
        session_id: res.session_id,
        guest_name: res.guest_name,
        deposit_applied: res.deposit_amount,
        items: (res.preorder || []).map((p) => ({
          dish_id: p.dish_id,
          title: p.title,
          price: p.price,
          qty: p.qty,
          mods: p.options || "Предзаказ к приходу"
        }))
      });
      this.saveLocal(true);
      return order;
    }

    sendOrderToTable({ table_id, guest_id = null, session_id = null, guest_name = null, deposit_applied = 0, items = [] }) {
      const guest = this.getLoggedInGuest();
      const sid = session_id || getAnonSessionId();
      const gId = guest_id || (guest ? guest.id : null);

      // Ищем открытый заказ именно этого гостя за этим столом
      let order = this.state.orders.find(
        (o) =>
          o.table_id === table_id &&
          o.status === "open" &&
          ((gId && o.guest_id === gId) || o.session_id === sid)
      );

      if (!order && !deposit_applied) {
        const myRes = this.state.reservations.find(
          (r) =>
            r.table_id === table_id &&
            r.status === "confirmed" &&
            ((gId && r.guest_id === gId) || r.session_id === sid)
        );
        if (myRes) {
          deposit_applied = myRes.deposit_amount;
          myRes.status = "seated";
          myRes.deposit_status = "applied";
        }
      }

      if (!order) {
        const nextNum = String(26 + this.state.orders.length);
        order = {
          id: uid("ord"),
          number: nextNum,
          code: nextNum + "-1",
          table_id,
          guest_id: gId,
          session_id: sid,
          guest_name: guest_name || (guest ? guest.full_name : "Гость " + table_id),
          waiter_id: "u-waiter",
          status: "open",
          subtotal: 0,
          deposit_applied: Number(deposit_applied || 0),
          bonus_used: 0,
          total: 0,
          paid_amount: 0,
          created_at: new Date().toISOString()
        };
        this.state.orders.unshift(order);
      } else if (deposit_applied > 0 && order.deposit_applied === 0) {
        order.deposit_applied = Number(deposit_applied);
      }

      const cooks = this.state.profiles.filter((p) => p.role === "cook" && p.is_active);
      items.forEach((it, idx) => {
        const dish = this.state.dishes.find((d) => d.id === it.dish_id);
        const cook = cooks.length ? cooks[idx % cooks.length] : { id: "u-chef" };
        this.state.order_items.push({
          id: uid("item"),
          order_id: order.id,
          order_num: order.number || "25",
          table_id: order.table_id,
          dish_id: it.dish_id,
          title: it.title,
          price: Number(it.price),
          qty: Number(it.qty || 1),
          mods: it.mods || "",
          status: "accepted",
          norm_min: dish ? dish.cook_time : 15,
          cook_id: cook.id,
          refunded: false,
          created_at: new Date().toISOString()
        });
        this.deductStockByTechCard(it.dish_id, Number(it.qty || 1), "sale", it.title);
      });

      this.recalcOrder(order.id);
      this.saveLocal(true);
      return order;
    }

    deductStockByTechCard(dishId, qty, reason, dishTitle) {
      const rows = this.state.tech_cards.filter((tc) => tc.dish_id === dishId);
      rows.forEach((tc) => {
        const ing = this.state.ingredients.find((i) => i.id === tc.ingredient_id);
        if (!ing) return;
        const used = Number((tc.qty * qty).toFixed(3));
        ing.stock_qty = Number(Math.max(0, ing.stock_qty - used).toFixed(3));
        this.state.write_offs.unshift({
          id: uid("wo"),
          ingredient_id: ing.id,
          dish_title: dishTitle || dishId,
          qty: used,
          unit: ing.unit,
          reason,
          cost: Math.round(used * ing.cost_per_unit),
          created_at: dateOffset(0)
        });
      });
    }

    recalcOrder(orderId) {
      const order = this.state.orders.find((o) => o.id === orderId);
      if (!order) return;
      const activeItems = this.state.order_items.filter((i) => i.order_id === orderId && !i.refunded && i.status !== "storno");
      order.subtotal = activeItems.reduce((s, i) => s + i.price * i.qty, 0);
      order.total = Math.max(0, order.subtotal - order.deposit_applied - order.bonus_used);
    }

    advanceDishStatus(itemId, nextStatus) {
      const item = this.state.order_items.find((i) => i.id === itemId);
      if (!item) return null;
      item.status = nextStatus;
      if (nextStatus === "cooking") item.started_at = new Date().toISOString();
      if (nextStatus === "ready") item.ready_at = new Date().toISOString();
      if (nextStatus === "served") item.served_at = new Date().toISOString();
      if (nextStatus === "storno") {
        item.refunded = true;
        this.recalcOrder(item.order_id);
      }
      this.saveLocal(true);
      return item;
    }

    payOrder({ orderId, payAmount, useBonus = 0, method = "Карта / Kaspi QR" }) {
      const order = this.state.orders.find((o) => o.id === orderId);
      if (!order) return null;
      const guest = this.getLoggedInGuest();

      if (useBonus > 0 && guest) {
        const actualBonus = Math.min(useBonus, guest.bonus_balance);
        guest.bonus_balance -= actualBonus;
        order.bonus_used += actualBonus;
        this.state.loyalty_log.unshift({
          id: uid("loy"),
          guest_id: guest.id,
          amount: -actualBonus,
          reason: `Оплата додокоинами/бонусами по заказу №${order.code}`,
          date: dateOffset(0)
        });
      }

      this.recalcOrder(order.id);
      const remaining = Math.max(0, order.total - order.paid_amount);
      const actualPay = Math.min(remaining, Number(payAmount || remaining));
      order.paid_amount += actualPay;

      if (actualPay > 0) {
        this.state.transactions.unshift({
          id: uid("tx"),
          direction: "in",
          type: "order",
          title: `Оплата по заказу №${order.code} (Стол ${order.table_id})`,
          amount: actualPay,
          method,
          created_at: new Date().toISOString()
        });
      }

      if (order.paid_amount >= order.total) {
        order.status = "paid";
        if (guest) {
          const cashback = Math.round((order.paid_amount + order.deposit_applied) * 0.05);
          if (cashback > 0) {
            guest.bonus_balance += cashback;
            this.state.loyalty_log.unshift({
              id: uid("loy"),
              guest_id: guest.id,
              amount: cashback,
              reason: `Кэшбэк 5% за оплаченный заказ №${order.code}`,
              date: dateOffset(0)
            });
          }
        }
      }

      this.saveLocal(true);
      return order;
    }

    addDishReview({ order_item_id, rating, tags, comment }) {
      const item = this.state.order_items.find((i) => i.id === order_item_id);
      if (!item) return null;
      const guest = this.getLoggedInGuest();
      const rev = {
        id: uid("rev"),
        order_item_id,
        dish_id: item.dish_id,
        dish_title: item.title,
        cook_id: item.cook_id,
        guest_id: guest ? guest.id : null,
        guest_name: guest ? guest.full_name : "Гость",
        rating: Number(rating),
        tags: tags || [],
        comment: (comment || "").trim(),
        created_at: new Date().toISOString()
      };
      this.state.reviews.unshift(rev);
      this.saveLocal(true);
      return rev;
    }

    createComplaint({ order_item_id, reason, description, photo_url, preferred }) {
      const item = this.state.order_items.find((i) => i.id === order_item_id);
      if (!item) return null;
      const guest = this.getLoggedInGuest();
      const cmp = {
        id: uid("cmp"),
        code: "RET-" + Math.floor(102 + Math.random() * 890),
        order_item_id: item.id,
        order_id: item.order_id,
        table_id: item.table_id,
        dish_id: item.dish_id,
        dish_title: item.title,
        cook_id: item.cook_id,
        guest_id: guest ? guest.id : null,
        guest_name: guest ? guest.full_name : "Гость Стола " + item.table_id,
        reason,
        description: (description || "").trim(),
        photo_url: photo_url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=70",
        amount: item.price * item.qty,
        preferred: preferred || "refund",
        status: "open",
        resolution_note: "",
        created_at: new Date().toISOString()
      };
      this.state.complaints.unshift(cmp);

      this.state.service_calls.unshift({
        id: uid("call"),
        table_id: item.table_id,
        type: "complaint",
        message: `🚨 ПРОБЛЕМА С БЛЮДОМ «${item.title}» (${reason}) — Стол ${item.table_id}!`,
        status: "new",
        created_at: new Date().toISOString()
      });

      this.saveLocal(true);
      return cmp;
    }

    resolveComplaint(cmpId, actionType) {
      const cmp = this.state.complaints.find((c) => c.id === cmpId);
      if (!cmp || cmp.status !== "open") return null;
      const item = this.state.order_items.find((i) => i.id === cmp.order_item_id);
      if (actionType === "refund") {
        cmp.status = "refunded";
        cmp.resolution_note = `Возврат ${fmt(cmp.amount)} на карту гостя`;
        if (item) {
          item.refunded = true;
          item.status = "storno";
          this.recalcOrder(item.order_id);
        }
        this.state.expenses.unshift({
          id: uid("exp"),
          category: "Возвраты гостям за проблемные блюда (Сторно)",
          title: `Возврат денег гостю за блюдо «${cmp.dish_title}» по акту ${cmp.code} (${cmp.reason})`,
          amount: cmp.amount,
          recipient: cmp.guest_name,
          date: dateOffset(0)
        });
      } else {
        cmp.status = "bonus";
        const bonusAmt = Math.round(cmp.amount * 1.2);
        cmp.resolution_note = `Начислено ${fmt(bonusAmt)} бонусов (+20%)`;
        const guest = this.state.profiles.find((p) => p.id === cmp.guest_id);
        if (guest) {
          guest.bonus_balance += bonusAmt;
          this.state.loyalty_log.unshift({
            id: uid("loy"),
            guest_id: guest.id,
            amount: bonusAmt,
            reason: `Компенсация бонусами по обращению ${cmp.code} («${cmp.dish_title}»)`,
            date: dateOffset(0)
          });
        }
      }
      this.deductStockByTechCard(cmp.dish_id, 1, "complaint", `Брак по акту ${cmp.code}: ${cmp.dish_title}`);
      const shift = this.state.shifts.find((s) => s.staff_id === cmp.cook_id);
      if (shift) shift.penalty = Number(shift.penalty || 0) + 1500;
      this.saveLocal(true);
      return cmp;
    }

    createSupply({ supplier, ingredient_id, qty, unit_cost, invoice }) {
      const ing = this.state.ingredients.find((i) => i.id === ingredient_id);
      if (!ing) throw new Error("Ингредиент не найден");
      const numQty = Number(qty);
      const numCost = Number(unit_cost || ing.cost_per_unit);
      const total = Math.round(numQty * numCost);
      ing.stock_qty = Number((ing.stock_qty + numQty).toFixed(3));
      ing.cost_per_unit = numCost;
      const staff = this.getLoggedInStaff();
      const sup = {
        id: uid("sup"),
        invoice: (invoice || "НКЛ-2026-" + Math.floor(100 + Math.random() * 899)).trim(),
        supplier,
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        qty: numQty,
        unit: ing.unit,
        unit_cost: numCost,
        total_cost: total,
        date: dateOffset(0),
        accepted_by: staff ? staff.full_name : "Бухгалтер"
      };
      this.state.supplies.unshift(sup);
      this.state.expenses.unshift({
        id: uid("exp"),
        category: "Закупка продуктов (Поставки)",
        title: `Оплата поставки по накладной ${sup.invoice}: ${ing.name} (${numQty} ${ing.unit} × ${fmt(numCost)})`,
        amount: total,
        recipient: supplier,
        date: dateOffset(0)
      });
      this.saveLocal(true);
      return sup;
    }

    addExpense({ category, title, amount, recipient }) {
      const exp = {
        id: uid("exp"),
        category,
        title: title.trim(),
        amount: Number(amount),
        recipient: (recipient || "Контрагент").trim(),
        date: dateOffset(0)
      };
      this.state.expenses.unshift(exp);
      this.saveLocal(true);
      return exp;
    }

    getAccountingSummary() {
      const orderIncome = this.state.transactions.filter((t) => t.type === "order").reduce((s, t) => s + t.amount, 0);
      const depositIncome = this.state.transactions.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
      const forfeitIncome = this.state.transactions.filter((t) => t.type === "deposit_forfeit").reduce((s, t) => s + t.amount, 0);
      const totalInflow = orderIncome + depositIncome + forfeitIncome;

      const cogsSales = this.state.write_offs.filter((w) => w.reason === "sale").reduce((s, w) => s + w.cost, 0);
      const cogsSpoilage = this.state.write_offs.filter((w) => w.reason !== "sale").reduce((s, w) => s + w.cost, 0);

      const grossMargin = totalInflow - cogsSales;
      const grossMarginPct = totalInflow > 0 ? Math.round((grossMargin / totalInflow) * 100) : 0;
      const foodCostPct = totalInflow > 0 ? Math.round((cogsSales / totalInflow) * 100) : 0;

      const suppliesSpent = this.state.expenses.filter((e) => e.category.includes("Поставки")).reduce((s, e) => s + e.amount, 0);
      const opexSpent = this.state.expenses.filter((e) => !e.category.includes("Поставки")).reduce((s, e) => s + e.amount, 0);

      const staffList = this.state.profiles.filter((p) => p.role !== "guest");
      const payrollTotal = staffList.reduce((sum, st) => {
        const sh = this.state.shifts.find((x) => x.staff_id === st.id) || { hours: 8, bonus: 0, penalty: 0 };
        return sum + sh.hours * st.hourly_rate + (sh.bonus || 0) - (sh.penalty || 0);
      }, 0);

      const totalOutflow = suppliesSpent + opexSpent + payrollTotal;
      const netOperatingProfit = grossMargin - opexSpent - payrollTotal - cogsSpoilage;

      return {
        orderIncome,
        depositIncome,
        forfeitIncome,
        totalInflow,
        cogsSales,
        cogsSpoilage,
        grossMargin,
        grossMarginPct,
        foodCostPct,
        suppliesSpent,
        opexSpent,
        payrollTotal,
        totalOutflow,
        netOperatingProfit
      };
    }

    callStaffFromTable(tableId, type, customMessage) {
      const msg =
        customMessage ||
        (type === "bill"
          ? `🧾 Стол ${tableId} просит принести счёт / терминал оплаты`
          : `🔔 Стол ${tableId} вызывает официанта`);
      this.state.service_calls.unshift({
        id: uid("call"),
        table_id: tableId,
        type,
        message: msg,
        status: "new",
        created_at: new Date().toISOString()
      });
      this.saveLocal(true);
    }

    closeServiceCall(callId) {
      const c = this.state.service_calls.find((x) => x.id === callId);
      if (c) c.status = "done";
      this.saveLocal(true);
    }

    toggleDishStock(dishId) {
      const d = this.state.dishes.find((x) => x.id === dishId);
      if (d) d.in_stock = !d.in_stock;
      this.saveLocal(true);
      return d;
    }

    createDish({ title, category_id, price, weight, kcal, cook_time, description, image }) {
      const dish = {
        id: uid("d"),
        category_id: category_id || "cat-mains",
        title: title.trim(),
        badge: "Новинка",
        description: (description || "Авторское блюдо от Шеф-повара L'AURUM").trim(),
        composition: (description || "Свежие фермерские ингредиенты").trim(),
        price: Number(price || 6500),
        weight: weight || "250 г",
        kcal: Number(kcal || 450),
        protein: 28,
        fat: 24,
        carbs: 22,
        allergens: [],
        has_doneness: category_id === "cat-steaks",
        removable: ["зелень", "соус", "лук"],
        upsell: ["d-lemonade"],
        cook_time: Number(cook_time || 15),
        in_stock: true,
        image: image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80"
      };
      this.state.dishes.unshift(dish);
      this.state.tech_cards.push({ dish_id: dish.id, ingredient_id: "ing-cream", qty: 0.15 });
      this.saveLocal(true);
      return dish;
    }
  }

  window.LaurumDB = new LaurumCoreEngine();
  window.LAURUM_CONST = {
    ROLE_INFO,
    DODO_ORDER_STATES,
    ALLERGENS,
    DONENESS,
    REVIEW_TAGS,
    COMPLAINT_REASONS,
    SUPPLIERS,
    fmt
  };
})();
