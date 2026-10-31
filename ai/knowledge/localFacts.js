"use strict";

const { money } = require("./dossier");

function buildLocalFacts(phone) {
  const wa = String(phone || "77028711150").replace(/\D/g, "") || "77028711150";
  return [
    { keys: ["сейчас", "работа", "работает", "евразия", "пресс", "ферм", "лошад", "осакар", "степ", "чем занима"], text: "Сейчас Эльмира руководит пресс-службой ТОО «Евразия Инвест LTD» в Осакаровском районе: поля, молочная ферма и конезавод. Снимает, пишет и ведёт страницы компании на казахском и русском." },
    { keys: ["резюме", "карьер", "канал", "арт", "хабар", "маслихат", "самрук", "казахстан", "университет", "нацагро", "где работа"], text: "Карьера на сайте разложена по девяти каналам: «АРТ» (2004–2010), филиал «Казахстана» (2010–2018), «Хабар 24», Yuwert IT, аппарат областного маслихата, медиацентр Казпотребсоюза, «Самрук-Казына Контракт», Нацагро НОЦ и сейчас «Евразия Инвест LTD». Подробности в разделе «Резюме»." },
    { keys: ["эфир", "програм", "дневник", "обсудим", "прямой", "100 шаг", "путь к истине", "вела"], text: "В 2010–2018 она вела «Дневник памяти», ток-шоу «Обсудим», «Путь к истине», «Прямой эфир» и «100 шагов». Раньше, на «АРТ», — «Актуально. Новости» и «Специальный репортаж»." },
    { keys: ["наград", "преми", "благодар", "конкурс", "аким", "министр"], text: "Шесть отметок: лучший телепроект «Прямой эфир» (2015), второе место за «100 шагов» (2016), премия акима области (2017), третье место «100 шагов» (2017), первое место «Путь к истине» (2017) и благодарность министра культуры и информации в 2024 году." },
    { keys: ["родил", "возраст", "караганд", "учеба", "учёба", "университет букет", "журналист", "биограф", "кто так", "о себе"], text: "Эльмира Манаповна Исаханова родилась 26 ноября 1982 года в Караганде. В 2003 году окончила журфак КарГУ имени Букетова. В профессии больше двадцати лет, большая часть — в прямом эфире." },
    { keys: ["связ", "контакт", "почт", "mail", "инстаграм", "instagram", "linkedin", "телефон", "написать", "whatsapp"], text: "Написать можно на basta_26_82@mail.ru, в Instagram https://www.instagram.com/elmira_issakhanova/ и в LinkedIn https://www.linkedin.com/in/elmira-issakhanova-07370697/. Личное сообщение уходит в WhatsApp https://wa.me/" + wa + ", кнопка «К Эльмире» соберёт текст заранее." },
    { keys: ["язык", "казах", "русск", "англий", "турец"], text: "Эльмира работает на казахском и русском, использует английский и иногда пишет по-турецки." },
    { keys: ["книг", "блог", "съемк", "съёмк", "capcut", "телефон"], text: "На сайте отмечено «скоро книга». Личный блог читают около 8,5 тысячи человек. Снимает на телефон, проходила курс мобильной фотографии и монтирует в CapCut." }
  ];
}

const localFacts = buildLocalFacts();

function localReply(question, products, phone) {
  const text = question.toLowerCase().replace(/ё/g, "е");
  const shopAsk = /магазин|витрин|цен|купить|заказ|корзин|товар|услуг|пелмен|рилс/.test(text);
  const ranked = buildLocalFacts(phone)
    .map((fact) => ({ fact, score: fact.keys.reduce((sum, key) => sum + (text.includes(key) ? key.length : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const parts = ranked.slice(0, 2).map((item) => item.fact.text);
  const list = Array.isArray(products) ? products : [];
  if (shopAsk) {
    if (!list.length) parts.push("Витрина сейчас пустая. Позиции появляются из админки.");
    else {
      const lines = list.map((item) => item.name + " — " + money(item.price, item.currency) + " (" + item.kind + ")");
      parts.push("На витрине: " + lines.join("; ") + ". Позицию добавляют в корзину, лишнее убирают перед отправкой, и заказ уходит в WhatsApp.");
    }
  }
  if (!parts.length) {
    return "Я на связи по сайту Эльмиры Исахановой. Могу рассказать о карьере, эфире, наградах, нынешней работе в «Евразия Инвест» и о витрине. Спросите конкретнее или откройте разделы «Резюме» и «Магазин».";
  }
  return parts.join(" ");
}

function fileReply(question, products, attachment, hasKey, phone) {
  if (attachment.text) {
    const excerpt = attachment.text.slice(0, 900);
    const aboutSite = localReply(question || "файл", products, phone);
    const siteBit = aboutSite.startsWith("Я на связи") ? "" : " " + aboutSite;
    return (
      "Прочитал «" +
      attachment.name +
      "»:\n" +
      excerpt +
      (attachment.text.length > 900 ? "…" : "") +
      siteBit
    );
  }
  if (attachment.image) {
    const size = attachment.size ? ", " + attachment.size : "";
    const why = hasKey
      ? "Сейчас модель не ответила, поэтому картинку разобрать не удалось — повторите вопрос чуть позже."
      : "Чтобы описать изображение, в .env нужна живая модель: ключ пока не подключён.";
    return "Вижу изображение «" + attachment.name + "»" + size + ". " + why;
  }
  const meta = attachment.size ? " (" + attachment.size + ")" : "";
  const note = attachment.parseNote ? " (" + attachment.parseNote + ")" : "";
  return (
    "Файл «" +
    attachment.name +
    "»" +
    meta +
    " получил" +
    note +
    ". Текст из него не извлёкся. Могу передать Эльмире через кнопку «К Эльмире», если нужен разбор."
  );
}

module.exports = { localFacts, buildLocalFacts, localReply, fileReply };
