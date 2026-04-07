const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db', 'tornado-center.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'db', 'schema.sql');

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

function seed() {
  const companyWallet = db.prepare('SELECT * FROM company_wallet WHERE id = 1').get();
  if (!companyWallet) {
    db.prepare('INSERT INTO company_wallet (id, balance) VALUES (1, 0)').run();
  }

  const plansCount = db.prepare('SELECT COUNT(*) AS count FROM plans').get().count;
  if (plansCount === 0) {
    const insertPlan = db.prepare('INSERT INTO plans (name, slug, price_monthly, description, features_json) VALUES (?, ?, ?, ?, ?)');
    insertPlan.run('Basic', 'basic', 299, 'Start dla mniejszych społeczności.', JSON.stringify([
      'Ogłoszenia doprecyzowane',
      'Podstawowa obsługa społeczności',
      '1 mały event w miesiącu'
    ]));
    insertPlan.run('Standard', 'standard', 599, 'Najczęściej wybierany pakiet dla rosnących community.', JSON.stringify([
      'Pakiet ogłoszeń profesjonalnych',
      'Rozszerzona obsługa społeczności',
      '2 eventy miesięcznie',
      '1 grafika do ogłoszenia gratis'
    ]));
    insertPlan.run('Premium', 'premium', 1199, 'Pełna obsługa i priorytet dla ambitnych projektów.', JSON.stringify([
      'Pakiet ogłoszeń profesjonalnych',
      'Pełna obsługa społeczności',
      'Do 4 eventów miesięcznie',
      'Priorytet realizacji',
      'Plan aktywizacji społeczności'
    ]));
  }

  const faqCount = db.prepare('SELECT COUNT(*) AS count FROM faqs').get().count;
  if (faqCount === 0) {
    const insertFaq = db.prepare('INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)');
    [
      ['Na czym polega obsługa społeczności?', 'Prowadzimy komunikację, ogłoszenia, eventy i aktywizację użytkowników.', 1],
      ['Czy mogę zmienić pakiet w trakcie współpracy?', 'Tak, pakiet można zmienić po kontakcie z obsługą lub przez nowe zamówienie.', 2],
      ['Czy trzeba mieć konto, aby złożyć zamówienie?', 'Tak. Zamówienia są dostępne wyłącznie po rejestracji i zalogowaniu.', 3],
      ['Jak przedłużyć plan?', 'W panelu klienta kliknij „Przedłuż plan”. System pobierze środki z portfela.', 4]
    ].forEach(([q, a, o]) => insertFaq.run(q, a, o));
  }

  const codeCount = db.prepare('SELECT COUNT(*) AS count FROM discount_codes').get().count;
  if (codeCount === 0) {
    db.prepare('INSERT INTO discount_codes (code, bonus_percent, is_active) VALUES (?, ?, 1)').run('BONUS10', 10);
    db.prepare('INSERT INTO discount_codes (code, bonus_percent, is_active) VALUES (?, ?, 1)').run('TORNADO10', 10);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (full_name, email, password_hash, role, wallet_balance) VALUES (?, ?, ?, ?, ?)');
    insertUser.run('Klient Demo', 'client@tornado.test', bcrypt.hashSync('demo123', 10), 'client', 800);
    insertUser.run('Admin Demo', 'admin@tornado.test', bcrypt.hashSync('demo123', 10), 'admin', 0);
    insertUser.run('Super Admin Demo', 'superadmin@tornado.test', bcrypt.hashSync('demo123', 10), 'superadmin', 0);

    const client = db.prepare("SELECT id FROM users WHERE email = 'client@tornado.test'").get();
    const standardPlan = db.prepare("SELECT * FROM plans WHERE slug = 'standard'").get();

    db.prepare(`
      INSERT INTO client_plans (user_id, plan_id, plan_name_snapshot, monthly_price_snapshot, status, end_date, next_payment_due)
      VALUES (?, ?, ?, ?, 'aktywny', date('now', '+30 day'), date('now', '+30 day'))
    `).run(client.id, standardPlan.id, standardPlan.name, standardPlan.price_monthly);

    db.prepare(`
      INSERT INTO orders (user_id, plan_id, plan_name_snapshot, monthly_price_snapshot, server_name, community_needs, additional_info, status, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'w trakcie realizacji', 'opłacone')
    `).run(client.id, standardPlan.id, standardPlan.name, standardPlan.price_monthly, 'Storm Hub', 'Potrzebujemy aktywizacji czatu i eventów.', 'Docelowo chcemy zwiększyć aktywność w weekendy.');
  }
}

seed();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tornado-center-demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.static(path.join(__dirname, 'public')));

function logActivity(actor, action, targetType = null, targetId = null, metadata = null) {
  db.prepare(`
    INSERT INTO activity_logs (actor_user_id, actor_role, action, target_type, target_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actor?.id || null, actor?.role || null, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null);
}

function getUserSafe(userId) {
  const user = db.prepare('SELECT id, full_name, email, role, wallet_balance, is_active, created_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const clientPlan = db.prepare(`
    SELECT id, plan_name_snapshot, monthly_price_snapshot, status, end_date, next_payment_due,
           active_payment_notice, active_demand_notice
    FROM client_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(userId);
  return { ...user, clientPlan };
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Musisz się zalogować.' });
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Brak autoryzacji.' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: 'Brak uprawnień.' });
    next();
  };
}

function sanitizeAdminUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    wallet_balance: row.wallet_balance,
    is_active: row.is_active,
    created_at: row.created_at
  };
}

function sanitizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

app.get('/api/bootstrap', (req, res) => {
  const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price_monthly ASC').all().map(p => ({
    ...p,
    features: JSON.parse(p.features_json || '[]')
  }));
  const faqs = db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC').all();
  const forumPosts = db.prepare(`
    SELECT fp.id, fp.title, fp.body, fp.created_at, u.full_name
    FROM forum_posts fp JOIN users u ON u.id = fp.user_id
    ORDER BY fp.id DESC LIMIT 10
  `).all();

  let user = null;
  if (req.session.user) user = getUserSafe(req.session.user.id);

  res.json({ user, plans, faqs, forumPosts });
});

app.post('/api/auth/register', (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Uzupełnij poprawnie formularz rejestracji.' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (exists) return res.status(400).json({ error: 'Konto z tym e-mailem już istnieje.' });

  const result = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, wallet_balance)
    VALUES (?, ?, ?, 'client', 0)
  `).run(fullName.trim(), String(email).toLowerCase().trim(), bcrypt.hashSync(password, 10));

  req.session.user = { id: result.lastInsertRowid, role: 'client' };
  logActivity(req.session.user, 'rejestracja użytkownika', 'user', result.lastInsertRowid, { email });
  res.json({ ok: true, user: getUserSafe(result.lastInsertRowid) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'Nieprawidłowy e-mail lub hasło.' });
  }
  if (!user.is_active) return res.status(403).json({ error: 'To konto jest wyłączone.' });
  req.session.user = { id: user.id, role: user.role };
  logActivity(req.session.user, 'logowanie', 'user', user.id, null);
  res.json({ ok: true, user: getUserSafe(user.id) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  logActivity(req.session.user, 'wylogowanie', 'user', req.session.user.id, null);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const user = getUserSafe(req.session.user.id);
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const messages = db.prepare('SELECT id, subject, body, status, admin_reply, created_at FROM messages WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(req.session.user.id);
  res.json({ user, orders, messages, transactions });
});

app.post('/api/profile', requireAuth, (req, res) => {
  const { fullName } = req.body;
  if (!fullName || String(fullName).trim().length < 2) return res.status(400).json({ error: 'Podaj poprawne imię i nazwę.' });
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(String(fullName).trim(), req.session.user.id);
  logActivity(req.session.user, 'edycja profilu', 'user', req.session.user.id, { fullName });
  res.json({ ok: true, user: getUserSafe(req.session.user.id) });
});

app.post('/api/orders', requireAuth, requireRole(['client']), (req, res) => {
  const { planId, serverName, communityNeeds, additionalInfo } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').get(planId);
  if (!plan) return res.status(400).json({ error: 'Wybrany pakiet nie istnieje.' });
  if (!serverName || !communityNeeds) return res.status(400).json({ error: 'Uzupełnij wymagane pola zamówienia.' });

  const result = db.prepare(`
    INSERT INTO orders (user_id, plan_id, plan_name_snapshot, monthly_price_snapshot, server_name, community_needs, additional_info, status, payment_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'nowe', 'nieopłacone')
  `).run(req.session.user.id, plan.id, plan.name, plan.price_monthly, serverName.trim(), communityNeeds.trim(), (additionalInfo || '').trim());

  const existingPlan = db.prepare('SELECT id FROM client_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.session.user.id);
  if (!existingPlan) {
    db.prepare(`
      INSERT INTO client_plans (user_id, plan_id, plan_name_snapshot, monthly_price_snapshot, status, next_payment_due)
      VALUES (?, ?, ?, ?, 'wymaga płatności', date('now', '+3 day'))
    `).run(req.session.user.id, plan.id, plan.name, plan.price_monthly);
  }

  logActivity(req.session.user, 'utworzenie zamówienia', 'order', result.lastInsertRowid, { planId });
  res.json({ ok: true, orderId: result.lastInsertRowid });
});

app.post('/api/wallet/topup', requireAuth, requireRole(['client']), (req, res) => {
  const amount = sanitizeAmount(req.body.amount);
  const code = (req.body.code || '').trim().toUpperCase();
  if (!amount) return res.status(400).json({ error: 'Podaj poprawną kwotę doładowania.' });

  let bonusPercent = 0;
  if (code) {
    const discount = db.prepare('SELECT * FROM discount_codes WHERE code = ? AND is_active = 1').get(code);
    if (!discount) return res.status(400).json({ error: 'Kod rabatowy jest nieprawidłowy lub nieaktywny.' });
    bonusPercent = Number(discount.bonus_percent) || 0;
  }

  const bonusAmount = Math.round((amount * bonusPercent)) / 100;
  const total = Math.round((amount + bonusAmount) * 100) / 100;

  db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(total, req.session.user.id);
  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, bonus_amount, code_used, description, created_by)
    VALUES (?, 'wallet_topup', ?, ?, ?, ?, ?)
  `).run(req.session.user.id, amount, bonusAmount, code || null, 'Doładowanie portfela klienta', req.session.user.id);

  logActivity(req.session.user, 'doładowanie portfela', 'user', req.session.user.id, { amount, bonusAmount, code: code || null });
  res.json({ ok: true, user: getUserSafe(req.session.user.id), bonusAmount });
});

app.post('/api/wallet/extend-plan', requireAuth, requireRole(['client']), (req, res) => {
  const user = getUserSafe(req.session.user.id);
  const clientPlan = user.clientPlan;
  if (!clientPlan) return res.status(400).json({ error: 'Nie masz jeszcze aktywnego planu do przedłużenia.' });
  if (user.wallet_balance < clientPlan.monthly_price_snapshot) {
    return res.status(400).json({ error: 'Brak środków w portfelu do przedłużenia planu.' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(clientPlan.monthly_price_snapshot, req.session.user.id);
    db.prepare('UPDATE company_wallet SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(clientPlan.monthly_price_snapshot);
    db.prepare(`
      UPDATE client_plans
      SET status = 'aktywny',
          end_date = COALESCE(date(end_date, '+30 day'), date('now', '+30 day')),
          next_payment_due = COALESCE(date(next_payment_due, '+30 day'), date('now', '+30 day')),
          active_payment_notice = 0,
          active_demand_notice = 0
      WHERE id = ?
    `).run(clientPlan.id);
    db.prepare(`
      INSERT INTO transactions (user_id, type, amount, description, created_by)
      VALUES (?, 'plan_extension', ?, ?, ?)
    `).run(req.session.user.id, clientPlan.monthly_price_snapshot, `Przedłużenie planu ${clientPlan.plan_name_snapshot}`, req.session.user.id);
    db.prepare(`
      UPDATE orders SET payment_status = 'opłacone', status = CASE WHEN status = 'oczekuje na płatność' THEN 'w trakcie realizacji' ELSE status END
      WHERE user_id = ?
    `).run(req.session.user.id);
  });

  tx();
  logActivity(req.session.user, 'przedłużenie planu z portfela', 'client_plan', clientPlan.id, { amount: clientPlan.monthly_price_snapshot });
  res.json({ ok: true, user: getUserSafe(req.session.user.id) });
});

app.post('/api/messages', requireAuth, requireRole(['client']), (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Uzupełnij temat i wiadomość.' });
  const result = db.prepare('INSERT INTO messages (user_id, subject, body) VALUES (?, ?, ?)').run(req.session.user.id, subject.trim(), body.trim());
  logActivity(req.session.user, 'wysłanie wiadomości do obsługi', 'message', result.lastInsertRowid, null);
  res.json({ ok: true });
});

app.post('/api/forum', requireAuth, (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Podaj tytuł i treść posta.' });
  const result = db.prepare('INSERT INTO forum_posts (user_id, title, body) VALUES (?, ?, ?)').run(req.session.user.id, title.trim(), body.trim());
  logActivity(req.session.user, 'dodanie wpisu forum', 'forum_post', result.lastInsertRowid, null);
  res.json({ ok: true });
});

app.get('/api/admin/overview', requireRole(['admin', 'superadmin']), (req, res) => {
  const orders = db.prepare(`
    SELECT o.id, o.plan_name_snapshot, o.server_name, o.status, o.payment_status, o.created_at,
           u.id as user_id, u.full_name
    FROM orders o JOIN users u ON u.id = o.user_id
    ORDER BY o.id DESC
  `).all();
  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.status, m.admin_reply, m.created_at,
           u.id as user_id, u.full_name
    FROM messages m JOIN users u ON u.id = m.user_id
    ORDER BY m.id DESC
  `).all();
  res.json({ orders, messages });
});

app.post('/api/admin/orders/:id/note', requireRole(['admin', 'superadmin']), (req, res) => {
  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: 'Notatka nie może być pusta.' });
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Nie znaleziono zamówienia.' });
  const result = db.prepare('INSERT INTO order_notes (order_id, admin_id, note) VALUES (?, ?, ?)').run(order.id, req.session.user.id, note);
  logActivity(req.session.user, 'dodanie notatki do zamówienia', 'order_note', result.lastInsertRowid, { orderId: order.id });
  res.json({ ok: true });
});

app.post('/api/admin/messages/:id/reply', requireRole(['admin', 'superadmin']), (req, res) => {
  const reply = (req.body.reply || '').trim();
  if (!reply) return res.status(400).json({ error: 'Odpowiedź nie może być pusta.' });
  db.prepare("UPDATE messages SET admin_reply = ?, status = 'w toku' WHERE id = ?").run(reply, req.params.id);
  logActivity(req.session.user, 'odpowiedź na wiadomość klienta', 'message', Number(req.params.id), null);
  res.json({ ok: true });
});

app.get('/api/superadmin/overview', requireRole(['superadmin']), (req, res) => {
  const users = db.prepare('SELECT id, full_name, email, role, wallet_balance, is_active, created_at FROM users ORDER BY id DESC').all();
  const plans = db.prepare('SELECT * FROM plans ORDER BY price_monthly ASC').all().map(p => ({ ...p, features: JSON.parse(p.features_json || '[]') }));
  const companyWallet = db.prepare('SELECT balance, updated_at FROM company_wallet WHERE id = 1').get();
  const discountCodes = db.prepare('SELECT * FROM discount_codes ORDER BY id DESC').all();
  const logs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 50').all();
  res.json({ users, plans, companyWallet, discountCodes, logs });
});

app.post('/api/superadmin/users/:id/wallet-credit', requireRole(['superadmin']), (req, res) => {
  const amount = sanitizeAmount(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'Podaj poprawną kwotę.' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
  db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(amount, req.params.id);
  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, description, created_by)
    VALUES (?, 'admin_credit', ?, ?, ?)
  `).run(req.params.id, amount, 'Ręczne zasilenie portfela przez super admina', req.session.user.id);
  logActivity(req.session.user, 'ręczne zasilenie portfela klienta', 'user', Number(req.params.id), { amount });
  res.json({ ok: true });
});

app.post('/api/superadmin/company-wallet/withdraw', requireRole(['superadmin']), (req, res) => {
  const amount = sanitizeAmount(req.body.amount);
  if (!amount) return res.status(400).json({ error: 'Podaj poprawną kwotę wypłaty.' });
  const wallet = db.prepare('SELECT balance FROM company_wallet WHERE id = 1').get();
  if (wallet.balance < amount) return res.status(400).json({ error: 'Brak wystarczających środków w portfelu firmowym.' });
  db.prepare('UPDATE company_wallet SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(amount);
  db.prepare(`
    INSERT INTO transactions (type, amount, description, created_by)
    VALUES ('company_withdrawal', ?, ?, ?)
  `).run(amount, 'Wypłata z portfela firmowego', req.session.user.id);
  logActivity(req.session.user, 'wypłata z portfela firmowego', 'company_wallet', 1, { amount });
  res.json({ ok: true });
});

app.post('/api/superadmin/client-plan/status', requireRole(['superadmin']), (req, res) => {
  const { userId, status, demandNotice, paymentNotice } = req.body;
  const allowed = ['aktywny', 'wygasający', 'nieopłacony', 'wymaga płatności', 'wygasły'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Nieprawidłowy status planu.' });
  const clientPlan = db.prepare('SELECT * FROM client_plans WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  if (!clientPlan) return res.status(404).json({ error: 'Klient nie ma planu.' });
  db.prepare(`
    UPDATE client_plans
    SET status = ?, active_demand_notice = ?, active_payment_notice = ?
    WHERE id = ?
  `).run(status, demandNotice ? 1 : 0, paymentNotice ? 1 : 0, clientPlan.id);
  logActivity(req.session.user, 'zmiana statusu planu klienta', 'client_plan', clientPlan.id, { status, demandNotice, paymentNotice });
  res.json({ ok: true });
});

app.post('/api/superadmin/orders/:id/status', requireRole(['superadmin']), (req, res) => {
  const { status, paymentStatus } = req.body;
  db.prepare('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?').run(status, paymentStatus, req.params.id);
  logActivity(req.session.user, 'zmiana statusu zamówienia', 'order', Number(req.params.id), { status, paymentStatus });
  res.json({ ok: true });
});

app.post('/api/superadmin/plans', requireRole(['superadmin']), (req, res) => {
  const { name, slug, priceMonthly, description, features } = req.body;
  const price = sanitizeAmount(priceMonthly);
  const featuresArray = Array.isArray(features) ? features : String(features || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!name || !slug || !price) return res.status(400).json({ error: 'Nazwa, slug i cena są wymagane.' });
  const result = db.prepare(`
    INSERT INTO plans (name, slug, price_monthly, description, features_json, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(name.trim(), slug.trim().toLowerCase(), price, (description || '').trim(), JSON.stringify(featuresArray));
  logActivity(req.session.user, 'dodanie pakietu', 'plan', result.lastInsertRowid, { name, price });
  res.json({ ok: true });
});

app.put('/api/superadmin/plans/:id', requireRole(['superadmin']), (req, res) => {
  const { name, slug, priceMonthly, description, features, isActive } = req.body;
  const price = sanitizeAmount(priceMonthly);
  const featuresArray = Array.isArray(features) ? features : String(features || '').split('\n').map(x => x.trim()).filter(Boolean);
  db.prepare(`
    UPDATE plans SET name = ?, slug = ?, price_monthly = ?, description = ?, features_json = ?, is_active = ? WHERE id = ?
  `).run(name.trim(), slug.trim().toLowerCase(), price, (description || '').trim(), JSON.stringify(featuresArray), isActive ? 1 : 0, req.params.id);
  logActivity(req.session.user, 'edycja pakietu', 'plan', Number(req.params.id), { name, price });
  res.json({ ok: true });
});

app.delete('/api/superadmin/plans/:id', requireRole(['superadmin']), (req, res) => {
  const plan = db.prepare('SELECT id, name FROM plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Nie znaleziono pakietu.' });
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
  logActivity(req.session.user, 'usunięcie pakietu', 'plan', Number(req.params.id), { name: plan.name });
  res.json({ ok: true });
});

app.post('/api/superadmin/codes', requireRole(['superadmin']), (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const bonusPercent = Number(req.body.bonusPercent || 10);
  if (!code) return res.status(400).json({ error: 'Podaj kod.' });
  db.prepare('INSERT INTO discount_codes (code, bonus_percent, is_active) VALUES (?, ?, 1)').run(code, bonusPercent);
  logActivity(req.session.user, 'dodanie kodu bonusowego', 'discount_code', null, { code, bonusPercent });
  res.json({ ok: true });
});

app.put('/api/superadmin/faqs/:id', requireRole(['superadmin']), (req, res) => {
  const { question, answer } = req.body;
  db.prepare('UPDATE faqs SET question = ?, answer = ? WHERE id = ?').run(question, answer, req.params.id);
  logActivity(req.session.user, 'edycja FAQ', 'faq', Number(req.params.id), null);
  res.json({ ok: true });
});

app.post('/api/contact', (req, res) => {
  const { name, email, projectName, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ error: 'Uzupełnij formularz kontaktowy.' });
  logActivity(null, 'formularz kontaktowy', 'contact_form', null, { name, email, projectName, subject });
  res.json({ ok: true, message: 'Wiadomość została zapisana w systemie demo.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tornado Center działa na http://localhost:${PORT}`);
});
