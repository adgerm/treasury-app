require('dotenv').config();

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
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error('Missing required env:', key);
    process.exit(1);
  }
}

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
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
