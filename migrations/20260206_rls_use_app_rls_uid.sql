-- Switch RLS policies from app.current_user (reserved word) to app.rls_uid
DROP POLICY IF EXISTS users_own ON users;
DROP POLICY IF EXISTS orgs_select_member ON orgs;
DROP POLICY IF EXISTS orgs_insert ON orgs;
DROP POLICY IF EXISTS orgs_update ON orgs;
DROP POLICY IF EXISTS memberships_select ON memberships;
DROP POLICY IF EXISTS memberships_insert ON memberships;
DROP POLICY IF EXISTS memberships_update ON memberships;
DROP POLICY IF EXISTS receipts_all ON receipts;
DROP POLICY IF EXISTS pending_syncs_all ON pending_syncs;
DROP POLICY IF EXISTS rooms_all ON rooms;
DROP POLICY IF EXISTS room_members_all ON room_members;
DROP POLICY IF EXISTS messages_all ON messages;
DROP POLICY IF EXISTS org_invites_select ON org_invites;
DROP POLICY IF EXISTS org_invites_insert ON org_invites;

CREATE POLICY users_own ON users FOR ALL USING (id = (current_setting('app.rls_uid', true)::uuid));

CREATE POLICY orgs_select_member ON orgs FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = orgs.id AND m.user_id = (current_setting('app.rls_uid', true)::uuid))
);
CREATE POLICY orgs_insert ON orgs FOR INSERT WITH CHECK (true);
CREATE POLICY orgs_update ON orgs FOR UPDATE USING (true);

CREATE POLICY memberships_select ON memberships FOR SELECT USING (
  user_id = (current_setting('app.rls_uid', true)::uuid)
  OR EXISTS (SELECT 1 FROM memberships m2 WHERE m2.org_id = memberships.org_id AND m2.user_id = (current_setting('app.rls_uid', true)::uuid))
);
CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (true);
CREATE POLICY memberships_update ON memberships FOR UPDATE USING (true);

CREATE POLICY receipts_all ON receipts FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = receipts.org_id AND m.user_id = (current_setting('app.rls_uid', true)::uuid))
);

CREATE POLICY pending_syncs_all ON pending_syncs FOR ALL USING (true);

CREATE POLICY rooms_all ON rooms FOR ALL USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = rooms.org_id AND m.user_id = (current_setting('app.rls_uid', true)::uuid))
);

CREATE POLICY room_members_all ON room_members FOR ALL USING (
  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = room_members.room_id AND rm.user_id = (current_setting('app.rls_uid', true)::uuid))
  OR EXISTS (SELECT 1 FROM rooms r JOIN memberships m ON m.org_id = r.org_id WHERE r.id = room_members.room_id AND m.user_id = (current_setting('app.rls_uid', true)::uuid))
);

CREATE POLICY messages_all ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = messages.room_id AND rm.user_id = (current_setting('app.rls_uid', true)::uuid))
);

CREATE POLICY org_invites_select ON org_invites FOR SELECT USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = org_invites.org_id AND m.user_id = (current_setting('app.rls_uid', true)::uuid))
);
CREATE POLICY org_invites_insert ON org_invites FOR INSERT WITH CHECK (true);
