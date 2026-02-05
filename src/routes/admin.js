const express = require('express');
const { knex } = require('../lib/knex');
const { authMiddleware } = require('../lib/auth-middleware');
const { orgMiddleware } = require('../lib/org-middleware');
const { requireRole } = require('../lib/role-middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(orgMiddleware);
router.use(requireRole(['admin']));

router.get('/pending-syncs', async (req, res, next) => {
  try {
    const list = await knex('pending_syncs')
      .where('org_id', req.org.id)
      .orderBy('created_at', 'desc')
      .limit(100);
    res.json({ pending_syncs: list });
  } catch (err) {
    next(err);
  }
});

router.post('/pending-syncs/force-run', async (req, res, next) => {
  try {
    const syncWorker = require('../workers/sheets_worker');
    await syncWorker.runOnce();
    res.json({ ok: true, message: 'Worker run triggered' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
