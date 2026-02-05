const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { knex } = require('./knex');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_EXPIRY_DAYS = 7;

function signAccessToken(payload) {
  return jwt.sign(
    { sub: payload.userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

async function createRefreshToken(userId) {
  const raw = uuidv4() + '.' + uuidv4();
  const hash = await bcrypt.hash(raw, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRY_DAYS);
  await knex('refresh_tokens').insert({
    id: uuidv4(),
    user_id: userId,
    token_hash: hash,
    expires_at: expiresAt,
  });
  return { raw, expiresAt };
}

async function verifyRefreshToken(raw) {
  const tokens = await knex('refresh_tokens')
    .where({ revoked: false })
    .where('expires_at', '>', knex.fn.now());
  for (const row of tokens) {
    const ok = await bcrypt.compare(raw, row.token_hash);
    if (ok) return { userId: row.user_id, tokenId: row.id };
  }
  return null;
}

async function invalidateRefreshToken(raw) {
  const tokens = await knex('refresh_tokens').where({ revoked: false });
  for (const row of tokens) {
    const ok = await bcrypt.compare(raw, row.token_hash);
    if (ok) {
      await knex('refresh_tokens').where({ id: row.id }).update({ revoked: true });
      return true;
    }
  }
  return false;
}

/** Invalidate by token id (e.g. from verifyRefreshToken). */
async function invalidateRefreshTokenById(tokenId) {
  const n = await knex('refresh_tokens').where({ id: tokenId }).update({ revoked: true });
  return n > 0;
}

function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'access') return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

module.exports = {
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  invalidateRefreshToken,
  invalidateRefreshTokenById,
  verifyAccessToken,
};
