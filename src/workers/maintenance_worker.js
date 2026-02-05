const { knex } = require('../lib/knex');

const DAYS = parseInt(process.env.MESSAGE_RETENTION_DAYS || '90', 10);

async function pruneOldMessages() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS);
  const deleted = await knex('messages').where('created_at', '<', cutoff).del();
  console.log('Pruned messages older than', DAYS, 'days:', deleted);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  console.log('Maintenance worker started (retention:', DAYS, 'days)');
  await pruneOldMessages();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
