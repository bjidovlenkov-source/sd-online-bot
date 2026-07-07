require('dotenv').config();
const express = require('express');
const bot = require('./src/bot');
const createAdminRouter = require('./src/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('СД онлайн бот работает. Админка: /admin');
});

app.use('/admin', createAdminRouter(bot));

app.listen(PORT, () => {
  console.log(`Веб-сервер (админка) запущен на порту ${PORT}`);
});

bot.launch().then(() => {
  console.log('Telegram-бот запущен и слушает сообщения (polling)');
});

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
