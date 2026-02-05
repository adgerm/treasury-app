const knex = require('knex');

const config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 1, max: 10 },
};

const db = knex(config);

// After each new connection, set a default for app.current_user (RLS)
db.client.pool.on('create', (client) => {
  client.query('SET app.current_user = NULL');
});

/**
 * Run a transaction with app.current_user set for RLS.
 * @param {string} userId - UUID of the authenticated user
 * @param {(trx: Knex.Transaction) => Promise<any>} trxCallback
 * @returns {Promise<any>}
 */
async function withUserId(userId, trxCallback) {
  return db.transaction(async (trx) => {
    await trx.raw("SET LOCAL app.current_user = ?", [userId || null]);
    return trxCallback(trx);
  });
}

module.exports = { knex: db, withUserId };
