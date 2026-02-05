# Roles & permissions

| Action | member | treasurer | admin |
|--------|--------|-----------|--------|
| Create receipt | ✓ | ✓ | ✓ |
| View receipts (own org) | ✓ | ✓ | ✓ |
| Approve/reject receipt | — | ✓ | ✓ |
| Promote/demote membership | — | — | ✓ |
| List/force-run pending syncs | — | — | ✓ |
| Invite to org (by code or email) | — | ✓ | ✓ |

Roles are stored on `memberships.role`. Use `requireRole(['admin'])` or `requireRole(['admin', 'treasurer'])` in routes accordingly.
