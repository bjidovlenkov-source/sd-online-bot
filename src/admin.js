const express = require('express');
const session = require('express-session');
const db = require('./db');
const { tests } = require('./questions');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change_me_please';
const SESSION_SECRET = process.env.SESSION_SECRET || 'insecure_default_secret';

const RESULT_LABELS = {
  healthy: '🟢 Здоровое партнёрство',
  earlyConflict: '🟡 Начало конфликта',
  activeConflict: '🟠 Активный конфликт',
  coldWar: '🔴 Холодная война',
  critical: '⚫ Критическая стадия'
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f5f5f7; margin: 0; padding: 0; color: #1c1c1e; }
  header { background: #1c1c1e; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  header a { color: white; text-decoration: none; margin-left: 20px; font-size: 14px; opacity: 0.85; }
  header a:hover { opacity: 1; }
  .container { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 20px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #fafafa; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .badge { padding: 3px 8px; border-radius: 12px; font-size: 13px; white-space: nowrap; }
  .filters { margin-bottom: 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  select, textarea, input[type=password], button {
    font-size: 14px; padding: 8px 10px; border-radius: 6px; border: 1px solid #ccc;
  }
  button { background: #1c1c1e; color: white; border: none; cursor: pointer; }
  button:hover { background: #333; }
  .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; }
  textarea { width: 100%; box-sizing: border-box; min-height: 100px; font-family: inherit; }
  .login-box { max-width: 320px; margin: 100px auto; }
  .stat { display: inline-block; margin-right: 24px; font-size: 14px; }
  .stat b { font-size: 20px; display: block; }
  .flash { background: #eaffea; border: 1px solid #b6e3b6; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
  .muted { color: #888; font-size: 13px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

function createAdminRouter(bot) {
  const router = express.Router();

  router.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 часов
  }));

  router.use(express.urlencoded({ extended: true }));

  router.get('/login', (req, res) => {
    res.send(layout('Вход в админку', `
      <div class="login-box card">
        <h1>СД онлайн — админка</h1>
        <form method="POST" action="/admin/login">
          <input type="password" name="password" placeholder="Пароль" style="width:100%; margin-bottom: 12px; box-sizing:border-box;" required />
          <button type="submit" style="width:100%;">Войти</button>
        </form>
        ${req.query.error ? '<p style="color:red; margin-top:10px;">Неверный пароль</p>' : ''}
      </div>
    `));
  });

  router.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      return res.redirect('/admin');
    }
    return res.redirect('/admin/login?error=1');
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  router.get('/', requireAuth, (req, res) => {
    const { result, testId } = req.query;
    const submissions = db.getSubmissions({ result: result || undefined, testId: testId || undefined });

    const counts = {};
    Object.keys(RESULT_LABELS).forEach(k => { counts[k] = 0; });
    db.getSubmissions().forEach(s => { counts[s.result] = (counts[s.result] || 0) + 1; });

    const statCards = Object.keys(RESULT_LABELS)
      .map(k => `<div class="stat"><b>${counts[k]}</b> ${RESULT_LABELS[k]}</div>`)
      .join('');

    const testOptions = Object.values(tests)
      .map(t => `<option value="${t.id}" ${testId === t.id ? 'selected' : ''}>${escapeHtml(t.menuButtonText)}</option>`)
      .join('');

    const rows = submissions.map(s => `
      <tr>
        <td class="muted">${new Date(s.createdAt).toLocaleString('ru-RU')}</td>
        <td>${s.username ? '@' + escapeHtml(s.username) : (s.firstName ? escapeHtml(s.firstName) : '<span class="muted">без ника</span>')}</td>
        <td class="muted">${escapeHtml(s.testTitle)}</td>
        <td><span class="badge">${RESULT_LABELS[s.result] || s.result}</span></td>
        <td class="muted">${s.total}</td>
      </tr>
    `).join('');

    res.send(layout('СД онлайн — база пользователей', `
      <header>
        <div>СД онлайн — админка</div>
        <div>
          <a href="/admin">База</a>
          <a href="/admin/broadcast">Рассылка</a>
          <a href="/admin/export${testId || result ? '?' + new URLSearchParams({ result: result || '', testId: testId || '' }) : ''}">Выгрузить CSV</a>
          <form method="POST" action="/admin/logout" style="display:inline;"><button type="submit" style="background:transparent; border:1px solid #666;">Выйти</button></form>
        </div>
      </header>
      <div class="container">
        <div class="card">
          ${statCards}
          <div class="stat"><b>${submissions.length}</b> всего показано</div>
        </div>

        <form method="GET" class="filters">
          <select name="result">
            <option value="">Все уровни</option>
            ${Object.keys(RESULT_LABELS).map(k =>
              `<option value="${k}" ${result === k ? 'selected' : ''}>${RESULT_LABELS[k]}</option>`
            ).join('')}
          </select>
          <select name="testId">
            <option value="">Все тесты</option>
            ${testOptions}
          </select>
          <button type="submit">Применить фильтр</button>
        </form>

        <table>
          <thead>
            <tr><th>Дата/время</th><th>Ник в Telegram</th><th>Тест</th><th>Результат</th><th>Баллы</th></tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" class="muted">Пока нет записей</td></tr>'}
          </tbody>
        </table>
      </div>
    `));
  });

  router.get('/export', requireAuth, (req, res) => {
    const { result, testId } = req.query;
    const submissions = db.getSubmissions({ result: result || undefined, testId: testId || undefined });
    const header = 'Дата;Ник;TelegramID;Тест;Результат;Баллы\n';
    const rows = submissions.map(s =>
      [
        new Date(s.createdAt).toLocaleString('ru-RU'),
        s.username ? '@' + s.username : (s.firstName || ''),
        s.telegramUserId,
        s.testTitle,
        s.result,
        s.total
      ].join(';')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sd_online_export.csv"');
    res.send('\uFEFF' + header + rows); // BOM для корректного открытия в Excel с кириллицей
  });

  router.get('/broadcast', requireAuth, (req, res) => {
    const testOptions = Object.values(tests)
      .map(t => `<option value="${t.id}">${escapeHtml(t.menuButtonText)}</option>`)
      .join('');

    res.send(layout('Рассылка', `
      <header>
        <div>СД онлайн — админка</div>
        <div>
          <a href="/admin">База</a>
          <a href="/admin/broadcast">Рассылка</a>
          <form method="POST" action="/admin/logout" style="display:inline;"><button type="submit" style="background:transparent; border:1px solid #666;">Выйти</button></form>
        </div>
      </header>
      <div class="container">
        ${req.query.sent ? `<div class="flash">Рассылка завершена. Успешно отправлено: ${req.query.ok}. Не удалось: ${req.query.fail}.</div>` : ''}
        <div class="card">
          <h1>Новая рассылка</h1>
          <form method="POST" action="/admin/broadcast">
            <p><label>Кому отправить:</label><br/>
              <select name="result" style="width:100%; margin-top:6px;">
                <option value="">Всем, кто проходил любой тест</option>
                ${Object.keys(RESULT_LABELS).map(k =>
                  `<option value="${k}">Только ${RESULT_LABELS[k]}</option>`
                ).join('')}
              </select>
            </p>
            <p><label>По какому тесту (необязательно):</label><br/>
              <select name="testId" style="width:100%; margin-top:6px;">
                <option value="">Любой тест</option>
                ${testOptions}
              </select>
            </p>
            <p><label>Текст сообщения:</label><br/>
              <textarea name="message" placeholder="Текст, который получат пользователи..." required></textarea>
            </p>
            <button type="submit">Отправить рассылку</button>
          </form>
        </div>
      </div>
    `));
  });

  router.post('/broadcast', requireAuth, async (req, res) => {
    const { result, testId, message } = req.body;
    const recipients = db.getRecipientsBySegment({ result: result || undefined, testId: testId || undefined });

    let ok = 0, fail = 0;
    for (const r of recipients) {
      try {
        await bot.telegram.sendMessage(r.telegramUserId, message);
        ok++;
      } catch (e) {
        fail++;
      }
      // Небольшая пауза, чтобы не упереться в лимиты Telegram API
      await new Promise(resolve => setTimeout(resolve, 60));
    }

    res.redirect(`/admin/broadcast?sent=1&ok=${ok}&fail=${fail}`);
  });

  return router;
}

module.exports = createAdminRouter;
