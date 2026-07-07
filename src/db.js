// ============================================================
// Простая база данных на одном JSON-файле.
// Никаких внешних СУБД не нужно — это специально сделано так,
// чтобы разместить бота было максимально просто.
//
// ВАЖНО: на хостинге (Railway/Render) нужно подключить
// постоянный диск (Volume) и указать его путь в DATA_DIR,
// иначе при каждом обновлении бота данные будут стираться.
// Подробности — в README.md, раздел "Хостинг".
// ============================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ submissions: [] }, null, 2));
  }
}

function readAll() {
  ensureStorage();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Если файл повреждён — не теряем всё, начинаем с пустой базы
    console.error('Ошибка чтения базы данных, создаю новую:', e);
    return { submissions: [] };
  }
}

function writeAll(data) {
  ensureStorage();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Сохранить одно прохождение теста
function addSubmission({ telegramUserId, username, firstName, testId, testTitle, answers, total, result }) {
  const data = readAll();
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    telegramUserId,
    username: username || null,
    firstName: firstName || null,
    testId,
    testTitle,
    answers,   // массив выбранных вариантов (текст) — для истории
    total,     // сумма баллов
    result     // 'red' | 'yellow' | 'green'
  };
  data.submissions.push(entry);
  writeAll(data);
  return entry;
}

// Получить все записи, с опциональным фильтром по цвету и/или тесту
function getSubmissions({ result, testId } = {}) {
  const data = readAll();
  let list = data.submissions;
  if (result) list = list.filter(s => s.result === result);
  if (testId) list = list.filter(s => s.testId === testId);
  // Сначала новые
  return list.slice().reverse();
}

// Уникальные telegramUserId для рассылки (последняя запись пользователя определяет его сегмент)
function getRecipientsBySegment({ result, testId } = {}) {
  const list = getSubmissions({ result, testId });
  const seen = new Set();
  const recipients = [];
  for (const entry of list) {
    if (!seen.has(entry.telegramUserId)) {
      seen.add(entry.telegramUserId);
      recipients.push(entry);
    }
  }
  return recipients;
}

module.exports = {
  addSubmission,
  getSubmissions,
  getRecipientsBySegment
};
