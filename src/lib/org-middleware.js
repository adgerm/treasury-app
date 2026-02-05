const { knex } = require('./knex');

function orgMiddleware(req, res, next) {
  const orgId = req.headers['x-org-id'] || req.body?.org_id || req.query?.org_id;
  if (!orgId) {
    return res.status(400).json({ error: 'x-org-id (or org_id) required' });
  }
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  knex('memberships')
    .where({ org_id: orgId, user_id: req.user.id })
    .first()
    .then((membership) => {
      if (!membership) {
        return res.status(403).json({ error: 'Not a member of this org' });
      }
      req.org = { id: orgId, role: membership.role, membershipId: membership.id };
      next();
    })
    .catch(next);
}

module.exports = { orgMiddleware };
