-- Roles/permissions scaffold (roles already on memberships.role)
-- Optional: permission lookup table for fine-grained checks
CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL PRIMARY KEY CHECK (role IN ('member', 'treasurer', 'admin')),
  permissions JSONB NOT NULL DEFAULT '[]'
);

INSERT INTO role_permissions (role, permissions) VALUES
  ('member', '["receipts:create", "receipts:read", "chats:read", "chats:write"]'),
  ('treasurer', '["receipts:create", "receipts:read", "receipts:approve", "chats:read", "chats:write", "org:invite"]'),
  ('admin', '["receipts:create", "receipts:read", "receipts:approve", "chats:read", "chats:write", "org:invite", "memberships:manage", "admin:syncs"]')
ON CONFLICT (role) DO NOTHING;
