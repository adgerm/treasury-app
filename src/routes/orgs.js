const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { knex, withUserId } = require('../lib/knex');
const { authMiddleware } = require('../lib/auth-middleware');
const { createSheetForOrg } = require('../lib/sheets-sync');

const router = express.Router();

function enqueueCreateSheet(orgId) {
  return knex('pending_syncs').insert({
    org_id: orgId,
    sync_type: 'create_sheet',
    payload: {},
  });
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const list = await withUserId(req.user.id, (trx) =>
      trx('memberships')
        .where('user_id', req.user.id)
        .join('orgs', 'orgs.id', 'memberships.org_id')
        .select('orgs.id', 'orgs.name', 'orgs.settings', 'orgs.created_at', 'memberships.role')
    );
    res.json({ orgs: list });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/invites', async (req, res, next) => {
  try {
    const membership = await knex('memberships').where({ org_id: req.params.id, user_id: req.user.id }).first();
    if (!membership) return res.status(403).json({ error: 'Not a member' });
    if (!['admin', 'treasurer'].includes(membership.role)) return res.status(403).json({ error: 'Insufficient role' });
    const expiresInDays = parseInt(req.body.expires_in_days, 10) || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const code = require('crypto').randomBytes(4).toString('hex');
    await knex('org_invites').insert({
      org_id: req.params.id,
      code,
      created_by: req.user.id,
      expires_at: expiresAt,
    });
    res.status(201).json({ code, expires_at: expiresAt });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const org = await withUserId(req.user.id, (trx) =>
      trx('orgs').where('id', req.params.id).first()
    );
    if (!org) return res.status(404).json({ error: 'Org not found' });
    const membership = await knex('memberships').where({ org_id: req.params.id, user_id: req.user.id }).first();
    if (!membership) return res.status(403).json({ error: 'Not a member' });
    const memberCount = await knex('memberships').where('org_id', req.params.id).count('* as c').first();
    res.json({ org: { ...org, membership_count: parseInt(memberCount?.c || 0, 10) } });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const orgId = uuidv4();
    let sheetId = null;
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE) {
        sheetId = await createSheetForOrg(name);
      }
    } catch (sheetErr) {
      console.warn('Sheet creation failed, org will have no sheet:', sheetErr.message);
    }
    const settings = sheetId ? { backup: { sheet_id: sheetId } } : {};
    await withUserId(req.user.id, async (trx) => {
      await trx('orgs').insert({ id: orgId, name, settings });
      await trx('memberships').insert({
        org_id: orgId,
        user_id: req.user.id,
        role: 'admin',
      });
    });
    if (!sheetId) await enqueueCreateSheet(orgId);
    const org = await knex('orgs').where('id', orgId).first();
    res.status(201).json({ org: { id: org.id, name: org.name, settings: org.settings } });
  } catch (err) {
    next(err);
  }
});

router.post('/join', async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const invite = await knex('org_invites')
      .where('code', code)
      .where('expires_at', '>', knex.fn.now())
      .first();
    if (!invite) return res.status(404).json({ error: 'Invalid or expired invite code' });
    await knex('memberships').insert({
      org_id: invite.org_id,
      user_id: req.user.id,
      role: 'member',
    }).onConflict(['org_id', 'user_id']).ignore();
    const org = await knex('orgs').where('id', invite.org_id).first();
    res.json({ org: { id: org.id, name: org.name }, joined: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
