function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.org) {
      return res.status(400).json({ error: 'Org context required (use orgMiddleware first)' });
    }
    if (!allowedRoles.includes(req.org.role)) {
      return res.status(403).json({ error: 'Insufficient role', required: allowedRoles });
    }
    next();
  };
}

module.exports = { requireRole };
