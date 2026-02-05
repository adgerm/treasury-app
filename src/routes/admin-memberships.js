const express = require('express');
const { knex } = require('../lib/knex');
const { authMiddleware } = require('../lib/auth-middleware');
const { requireRole } = require('../lib/role-middleware');
const { orgMiddleware } = require('../lib/org-middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(orgMiddleware);
router.use(requireRole(['admin']));

router.patch('/:userId/role', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!role || !['member', 'treasurer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be member, treasurer, or admin' });
    }
    const membership = await knex('memberships')
      .where({ org_id: req.org.id, user_id: userId })
      .first();
    if (!membership) return res.status(404).json({ error: 'Membership not found' });
    await knex('memberships').where({ org_id: req.org.id, user_id: userId }).update({ role });
    const updated = await knex('memberships').where({ org_id: req.org.id, user_id: userId }).first();
    res.json({ membership: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
