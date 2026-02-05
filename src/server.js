require('dotenv').config();
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('unhandledRejection:', reason);
  process.exit(1);
});
console.log('Server process started');

const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const Sentry = require('@sentry/node');

const { initSentry } = require('./lib/sentry');
const { knex } = require('./lib/knex');
const { initSocket } = require('./lib/socket');

const authRoutes = require('./routes/auth');
const orgsRoutes = require('./routes/orgs');
const receiptsRoutes = require('./routes/receipts');
const chatsRoutes = require('./routes/chats');
const adminMembershipsRoutes = require('./routes/admin-memberships');
const adminRoutes = require('./routes/admin');

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET'];
const missing = requiredEnv.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('Missing required env:', missing.join(', '));
  console.error('On Render: add a Postgres instance, link it to this service (sets DATABASE_URL), and set JWT_SECRET and REFRESH_TOKEN_SECRET in Environment.');
  process.exit(1);
}
console.log('Env OK, connecting to database...');

const app = express();
initSentry(app);

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', async (req, res) => {
  try {
    await knex.raw('SELECT 1');
    res.status(200).json({ ok: true, db: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await knex.raw('SELECT 1');
    res.status(200).json({ ok: true, db: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgsRoutes);
app.use('/api/receipts', receiptsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/admin/memberships', adminMembershipsRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  if (Sentry) Sentry.captureException(err);
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await knex.raw('SELECT 1');
    console.log('Database OK');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
  server.listen(PORT, () => {
    console.log('Server listening on', PORT);
  });
}

start().catch((err) => {
  console.error('Start failed:', err);
  process.exit(1);
});
