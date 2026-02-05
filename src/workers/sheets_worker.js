const { knex } = require('../lib/knex');
const { createSheetForOrg, appendReceiptRow, updateReceiptRowByRowNumber } = require('../lib/sheets-sync');
const { getPresignedUrl } = require('../lib/storage');

const MAX_RETRIES = 10;
const BACKOFF_MS = 5000;

async function processOne(sync) {
  const org = await knex('orgs').where('id', sync.org_id).first();
  if (!org) return;

  if (sync.sync_type === 'create_sheet') {
    const sheetId = await createSheetForOrg(org.name);
    const settings = { ...(org.settings || {}), backup: { ...(org.settings?.backup || {}), sheet_id: sheetId } };
    await knex('orgs').where('id', sync.org_id).update({ settings });
    return;
  }

  const sheetId = org.settings?.backup?.sheet_id;
  if (!sheetId) return;

  if (sync.sync_type === 'append_receipt') {
    const receipt = sync.receipt_id
      ? await knex('receipts').where('id', sync.receipt_id).first()
      : (sync.payload && { ...sync.payload, created_at: sync.payload.created_at || new Date().toISOString() });
    if (!receipt) return;
    const photoUrl = receipt.photo_s3_key ? getPresignedUrl(receipt.photo_s3_key) : receipt.photo_url;
    await appendReceiptRow(sheetId, { ...receipt, photo_url: photoUrl });
    if (sync.receipt_id) {
      const count = await knex('receipts').where('org_id', sync.org_id).count('* as c').first();
      const rowNum = parseInt(count?.c || 0, 10) + 1;
      await knex('receipts').where('id', sync.receipt_id).update({
        sheet_sync_status: 'synced',
        sheet_row_number: rowNum,
        updated_at: knex.fn.now(),
      });
    }
    return;
  }

  if (sync.sync_type === 'update_receipt' && sync.payload?.row_number && sync.receipt_id) {
    const receipt = await knex('receipts').where('id', sync.receipt_id).first();
    if (!receipt) return;
    const photoUrl = receipt.photo_s3_key ? getPresignedUrl(receipt.photo_s3_key) : receipt.photo_url;
    await updateReceiptRowByRowNumber(sheetId, sync.payload.row_number, { ...receipt, photo_url: photoUrl });
    return;
  }
}

async function processPendingSyncs() {
  const due = await knex('pending_syncs')
    .where('retry_count', '<', MAX_RETRIES)
    .where('next_retry_at', '<=', knex.fn.now())
    .orderBy('created_at', 'asc')
    .limit(20);
  for (const sync of due) {
    try {
      await processOne(sync);
      await knex('pending_syncs').where('id', sync.id).del();
    } catch (err) {
      console.warn('Sync failed:', sync.id, err.message);
      await knex('pending_syncs').where('id', sync.id).update({
        retry_count: sync.retry_count + 1,
        next_retry_at: new Date(Date.now() + BACKOFF_MS * Math.pow(2, sync.retry_count)),
      });
    }
  }
}

async function runOnce() {
  await processPendingSyncs();
}

async function loop() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  console.log('Sheets worker started');
  while (true) {
    try {
      await processPendingSyncs();
    } catch (err) {
      console.error('Worker error:', err);
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}

if (require.main === module) {
  loop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runOnce, processPendingSyncs, loop };
