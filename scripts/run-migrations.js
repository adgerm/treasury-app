const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const order = [
  '20260202_users.sql',
  '20260203_add_multi_org_and_sheet_sync.sql',
  '20260204_add_chat_tables.sql',
  '20260205_rls_policies.sql',
  '20260205_refresh_tokens.sql',
  '20260205_roles_permissions.sql',
];

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const name of order) {
      const filePath = path.join(migrationsDir, name);
      if (!fs.existsSync(filePath)) {
        console.warn('Skip (not found):', name);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log('Ran:', name);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
