const knex = require('knex');

const connection = process.env.DATABASE_URL;
const connectionConfig =
  typeof connection === 'string'
    ? {
        connectionString: connection,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }
    : connection;

const config = {
  client: 'pg',
  connection: connectionConfig,
  pool: {
    min: 1,
    max: 10,
    afterCreate: (conn, done) => {
      conn.query('SET "app.current_user" = NULL', (err) => done(err));
    },
  },
};

const db = knex(config);

/**
 * Run a transaction with app.current_user set for RLS.
 * @param {string} userId - UUID of the authenticated user
 * @param {(trx: Knex.Transaction) => Promise<any>} trxCallback
 * @returns {Promise<any>}
 */
async function withUserId(userId, trxCallback) {
  return db.transaction(async (trx) => {
    await trx.raw('SET LOCAL "app.current_user" = ?', [userId || null]);
    return trxCallback(trx);
  });
}

module.exports = { knex: db, withUserId };
