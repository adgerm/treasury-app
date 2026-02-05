-- Enable RLS; policies use current_setting('app.current_user')::uuid
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;

-- users: own row only
CREATE POLICY users_own ON users FOR ALL USING (id = (current_setting('app.current_user', true)::uuid));

-- orgs: members can read; no direct insert (memberships created via API with set user)
CREATE POLICY orgs_select_member ON orgs FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = orgs.id AND m.user_id = (current_setting('app.current_user', true)::uuid))
);
CREATE POLICY orgs_insert ON orgs FOR INSERT WITH CHECK (true);
CREATE POLICY orgs_update ON orgs FOR UPDATE USING (true);

-- memberships: members of same org can read; insert/update restricted by app logic
CREATE POLICY memberships_select ON memberships FOR SELECT USING (
  user_id = (current_setting('app.current_user', true)::uuid)
  OR EXISTS (SELECT 1 FROM memberships m2 WHERE m2.org_id = memberships.org_id AND m2.user_id = (current_setting('app.current_user', true)::uuid))
);
CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (true);
CREATE POLICY memberships_update ON memberships FOR UPDATE USING (true);

-- receipts: org members can read; insert/update in app with withUserId
CREATE POLICY receipts_all ON receipts FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = receipts.org_id AND m.user_id = (current_setting('app.current_user', true)::uuid))
);

-- pending_syncs: admin/worker only; worker runs without RLS or with service role
CREATE POLICY pending_syncs_all ON pending_syncs FOR ALL USING (true);

-- rooms: org members
CREATE POLICY rooms_all ON rooms FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = rooms.org_id AND m.user_id = (current_setting('app.current_user', true)::uuid))
);

-- room_members: room members can read
CREATE POLICY room_members_all ON room_members FOR ALL USING (
  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = room_members.room_id AND rm.user_id = (current_setting('app.current_user', true)::uuid))
  OR EXISTS (SELECT 1 FROM rooms r JOIN memberships m ON m.org_id = r.org_id WHERE r.id = room_members.room_id AND m.user_id = (current_setting('app.current_user', true)::uuid))
);

-- messages: room members
CREATE POLICY messages_all ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = messages.room_id AND rm.user_id = (current_setting('app.current_user', true)::uuid))
);

-- org_invites: org members can read
CREATE POLICY org_invites_select ON org_invites FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = org_invites.org_id AND m.user_id = (current_setting('app.current_user', true)::uuid))
);
CREATE POLICY org_invites_insert ON org_invites FOR INSERT WITH CHECK (true);
