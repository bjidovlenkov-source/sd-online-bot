const { Telegraf, Markup } = require('telegraf');
const { tests, calculateResult } = require('./questions');
const db = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('Не задан BOT_TOKEN в переменных окружения (.env)');
}

const bot = new Telegraf(BOT_TOKEN);

// Временное хранилище состояния прохождения теста для каждого пользователя.
// Хранится только в памяти процесса — это нормально, т.к. тест короткий (10 вопросов),
// проходится за пару минут, и не требует сохранения между перезапусками бота.
const sessions = new Map(); // key: telegramUserId -> { testId, questionIndex, points: [], answersText: [] }

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function questionKeyboard(testId, qIndex, options) {
  const buttons = options.map((opt, i) => [
    Markup.button.callback(opt.text, `ans:${testId}:${qIndex}:${i}`)
  ]);
  return { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) };
}

async function sendQuestion(ctx, testId, qIndex) {
  const test = tests[testId];
  const question = test.questions[qIndex];
  const numberEmoji = NUMBER_EMOJIS[qIndex] || `${qIndex + 1}.`;
  const progress = `*Вопрос ${qIndex + 1} из ${test.questions.length}*`;
  const text = `${progress}\n\n${numberEmoji} ${question.text}`;
  const extra = questionKeyboard(testId, qIndex, question.options);
  await ctx.editMessageText(text, extra).catch(async () => {
    // Если сообщение нельзя отредактировать (например, устарело) — отправим новое
    await ctx.reply(text, extra);
  });
}

// Стартовый экран теста: текст-интро + кнопка "НАЧАТЬ"
async function sendTestIntro(ctx, testId, { edit } = { edit: false }) {
  const test = tests[testId];
  const introExtra = {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([[Markup.button.callback('НАЧАТЬ ➡️', `start_test:${testId}`)]])
  };
  if (edit) {
    await ctx.editMessageText(test.intro, introExtra).catch(async () => {
      await ctx.reply(test.intro, introExtra);
    });
  } else {
    await ctx.reply(test.intro, introExtra);
  }
}

async function finishTest(ctx, testId) {
  const session = sessions.get(ctx.from.id);
  const test = tests[testId];
  const { total, result } = calculateResult(testId, session.points);
  const resultInfo = test.results[result];

  db.addSubmission({
    telegramUserId: ctx.from.id,
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    testId,
    testTitle: test.menuButtonText,
    answers: session.answersText,
    total,
    result
  });

  const titleLine = `${resultInfo.emoji || ''} *${resultInfo.title}*`.trim();
  const parts = [titleLine, resultInfo.text];
  if (test.ctaText) parts.push(test.ctaText);
  const resultText = parts.join('\n\n');

  const resultKeyboard = {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.url(test.ctaContactButtonText, test.ctaContactUrl)],
      [Markup.button.url(test.ctaButtonText, test.ctaUrl)]
    ])
  };

  await ctx.editMessageText(resultText, resultKeyboard).catch(async () => {
    await ctx.reply(resultText, resultKeyboard);
  });

  sessions.delete(ctx.from.id);
}

// Пока в системе один тест — бот сразу открывает его интро.
// Когда появится второй тест, этот блок нужно будет заменить обратно
// на показ меню выбора (см. функцию mainMenuKeyboard ниже).
bot.start(async (ctx) => {
  const firstTestId = Object.keys(tests)[0];
  sessions.set(ctx.from.id, { testId: firstTestId, questionIndex: 0, points: [], answersText: [] });
  await sendTestIntro(ctx, firstTestId, { edit: false });
});

function mainMenuKeyboard() {
  const buttons = Object.values(tests).map(t => [
    Markup.button.callback(t.menuButtonText, `menu:${t.id}`)
  ]);
  return { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) };
}

// Пользователь выбрал тест из меню (задел на будущее, когда тестов станет больше)
bot.action(/^menu:(.+)$/, async (ctx) => {
  const testId = ctx.match[1];
  const test = tests[testId];
  if (!test) return ctx.answerCbQuery('Тест не найден');
  await ctx.answerCbQuery();
  sessions.set(ctx.from.id, { testId, questionIndex: 0, points: [], answersText: [] });
  await sendTestIntro(ctx, testId, { edit: true });
});

bot.action(/^start_test:(.+)$/, async (ctx) => {
  const testId = ctx.match[1];
  await ctx.answerCbQuery();
  await sendQuestion(ctx, testId, 0);
});

// Пользователь ответил на вопрос
bot.action(/^ans:(.+):(\d+):(\d+)$/, async (ctx) => {
  const testId = ctx.match[1];
  const qIndex = parseInt(ctx.match[2], 10);
  const optIndex = parseInt(ctx.match[3], 10);

  const session = sessions.get(ctx.from.id);
  if (!session || session.testId !== testId || session.questionIndex !== qIndex) {
    // Сессия устарела/рассинхронизирована (например, бот перезапускался) — начнём заново
    await ctx.answerCbQuery('Сессия сброшена, начнём заново');
    sessions.set(ctx.from.id, { testId, questionIndex: 0, points: [], answersText: [] });
    return sendQuestion(ctx, testId, 0);
  }

  const test = tests[testId];
  const option = test.questions[qIndex].options[optIndex];
  session.points.push(option.points);
  session.answersText.push(option.text);
  await ctx.answerCbQuery();

  const nextIndex = qIndex + 1;
  if (nextIndex < test.questions.length) {
    session.questionIndex = nextIndex;
    await sendQuestion(ctx, testId, nextIndex);
  } else {
    await finishTest(ctx, testId);
  }
});

module.exports = bot;
