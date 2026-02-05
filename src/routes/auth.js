const express = require('express');
const bcrypt = require('bcrypt');
const { knex } = require('../lib/knex');
const {
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  invalidateRefreshToken,
} = require('../lib/auth-tokens');

const router = express.Router();
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await knex('users')
      .insert({
        email: email.toLowerCase().trim(),
        password_hash,
        display_name: display_name || null,
      })
      .returning(['id', 'email', 'display_name', 'created_at']);
    if (!user) return res.status(500).json({ error: 'Insert failed' });
    const { raw } = await createRefreshToken(user.id);
    const accessToken = signAccessToken({ userId: user.id });
    res.cookie('refresh_token', raw, REFRESH_COOKIE_OPTIONS);
    res.status(201).json({ user: { id: user.id, email: user.email, display_name: user.display_name }, access_token: accessToken });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const user = await knex('users').where({ email: email.toLowerCase().trim() }).first();
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const { raw } = await createRefreshToken(user.id);
    const accessToken = signAccessToken({ userId: user.id });
    res.cookie('refresh_token', raw, REFRESH_COOKIE_OPTIONS);
    res.json({
      access_token: accessToken,
      user: { id: user.id, email: user.email, display_name: user.display_name },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (!raw) return res.status(401).json({ error: 'No refresh token' });
    const data = await verifyRefreshToken(raw);
    if (!data) return res.status(401).json({ error: 'Invalid or expired refresh token' });
    const accessToken = signAccessToken({ userId: data.userId });
    res.json({ access_token: accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const raw = req.cookies?.refresh_token;
    if (raw) await invalidateRefreshToken(raw);
    res.clearCookie('refresh_token', { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
