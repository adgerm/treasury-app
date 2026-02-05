const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { knex, withUserId } = require('../lib/knex');
const { authMiddleware } = require('../lib/auth-middleware');
const { orgMiddleware } = require('../lib/org-middleware');
const { requireRole } = require('../lib/role-middleware');
const { uploadToS3, getPresignedUrl } = require('../lib/storage');
const { validateCreateReceipt, validateUpdateReceipt } = require('../lib/validation');
const { appendReceiptRow, updateReceiptRowByRowNumber } = require('../lib/sheets-sync');
const { sendReceiptStatusEmail } = require('../lib/notifications');
const multer = require('multer');

const router = express.Router();
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

function enqueuePendingSync(orgId, syncType, receiptId, payload) {
  return knex('pending_syncs').insert({
    org_id: orgId,
    sync_type: syncType,
    receipt_id: receiptId || null,
    payload: payload || {},
  });
}

router.use(authMiddleware);
router.use(orgMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const { status, member_id, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 100);
    const offsetNum = parseInt(offset, 10) || 0;
    const receipts = await withUserId(req.user.id, (trx) => {
      let q = trx('receipts').where('org_id', req.org.id);
      if (status) q = q.where('status', status);
      if (member_id) q = q.where('submitted_by', member_id);
      return q.orderBy('created_at', 'desc').limit(limitNum).offset(offsetNum);
    });
    const totalResult = await withUserId(req.user.id, (trx) => {
      let q = trx('receipts').where('org_id', req.org.id);
      if (status) q = q.where('status', status);
      if (member_id) q = q.where('submitted_by', member_id);
      return q.count('* as c').first();
    });
    res.json({ receipts, total: parseInt(totalResult?.c || 0, 10) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const receipt = await withUserId(req.user.id, (trx) =>
      trx('receipts').where('id', req.params.id).where('org_id', req.org.id).first()
    );
    if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
    res.json({ receipt });
  } catch (err) {
    next(err);
  }
});

router.post('/', upload.single('photo'), async (req, res, next) => {
  try {
    const parsed = validateCreateReceipt({
      description: req.body.description,
      amount: parseFloat(req.body.amount),
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { description, amount } = parsed.data;
    let photo_url = null;
    let photo_s3_key = null;
    if (req.file) {
      const { url, key } = await uploadToS3(req.file, 'receipts');
      photo_url = url;
      photo_s3_key = key;
    }
    const org = await knex('orgs').where('id', req.org.id).first();
    const sheetId = org?.settings?.backup?.sheet_id;
    const receiptId = uuidv4();
    await withUserId(req.user.id, (trx) =>
      trx('receipts').insert({
        id: receiptId,
        org_id: req.org.id,
        submitted_by: req.user.id,
        description,
        amount,
        photo_url,
        photo_s3_key,
      })
    );
    let sheet_sync_status = 'pending';
    let sheet_row_number = null;
    if (sheetId) {
      try {
        const receiptRow = { description, amount, status: 'pending', photo_url, created_at: new Date().toISOString() };
        await appendReceiptRow(sheetId, receiptRow);
        const countResult = await knex('receipts').where('org_id', req.org.id).count('* as c').first();
        sheet_row_number = parseInt(countResult?.c || 0, 10) + 1;
        sheet_sync_status = 'synced';
        await knex('receipts').where('id', receiptId).update({ sheet_sync_status, sheet_row_number, updated_at: knex.fn.now() });
      } catch (e) {
        await enqueuePendingSync(req.org.id, 'append_receipt', receiptId, { description, amount, photo_url, photo_s3_key });
      }
    }
    const receipt = await knex('receipts').where('id', receiptId).first();
    res.status(201).json({ receipt });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireRole(['admin', 'treasurer']), async (req, res, next) => {
  try {
    const parsed = validateUpdateReceipt(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const existing = await withUserId(req.user.id, (trx) =>
      trx('receipts').where('id', req.params.id).where('org_id', req.org.id).first()
    );
    if (!existing) return res.status(404).json({ error: 'Receipt not found' });
    const updates = { ...parsed.data, updated_at: new Date() };
    await knex('receipts').where('id', req.params.id).update(updates);
    const receipt = await knex('receipts').where('id', req.params.id).first();
    if (updates.status === 'approved' || updates.status === 'rejected') {
      const submitter = await knex('users').where('id', existing.submitted_by).first();
      if (submitter?.email) {
        try {
          await sendReceiptStatusEmail(submitter.email, receipt, updates.status);
        } catch (e) {
          console.warn('Email send failed:', e.message);
        }
      }
      const org = await knex('orgs').where('id', req.org.id).first();
      const sheetId = org?.settings?.backup?.sheet_id;
      if (sheetId && existing.sheet_row_number) {
        const photoUrl = receipt.photo_s3_key ? getPresignedUrl(receipt.photo_s3_key) : receipt.photo_url;
        try {
          await updateReceiptRowByRowNumber(sheetId, existing.sheet_row_number, {
            ...receipt,
            photo_url: photoUrl,
          });
        } catch (e) {
          await enqueuePendingSync(req.org.id, 'update_receipt', receipt.id, {
            row_number: existing.sheet_row_number,
            receipt: { ...receipt, photo_url: photoUrl },
          });
        }
      }
    }
    res.json({ receipt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
