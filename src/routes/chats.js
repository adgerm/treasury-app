const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { knex, withUserId } = require('../lib/knex');
const { authMiddleware } = require('../lib/auth-middleware');
const { orgMiddleware } = require('../lib/org-middleware');
const { uploadToS3 } = require('../lib/storage');
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

function makeInviteCode() {
  return uuidv4().replace(/-/g, '').slice(0, 8);
}

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const orgId = req.query.org_id || req.headers['x-org-id'];
    if (!orgId) return res.status(400).json({ error: 'org_id or x-org-id required' });
    const membership = await knex('memberships').where({ org_id: orgId, user_id: req.user.id }).first();
    if (!membership) return res.status(403).json({ error: 'Not a member' });
    const rooms = await withUserId(req.user.id, (trx) =>
      trx('room_members')
        .where('room_members.user_id', req.user.id)
        .join('rooms', 'rooms.id', 'room_members.room_id')
        .where('rooms.org_id', orgId)
        .select('rooms.id', 'rooms.name', 'rooms.room_type', 'rooms.invite_code', 'rooms.created_at')
    );
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
});

router.post('/', orgMiddleware, async (req, res, next) => {
  try {
    const { name } = req.body;
    const roomId = uuidv4();
    const inviteCode = makeInviteCode();
    await withUserId(req.user.id, (trx) =>
      trx('rooms').insert({
        id: roomId,
        org_id: req.org.id,
        name: name || 'Group Chat',
        room_type: 'group',
        invite_code: inviteCode,
      })
    );
    await knex('room_members').insert({ room_id: roomId, user_id: req.user.id, role: 'admin' });
    const room = await knex('rooms').where('id', roomId).first();
    res.status(201).json({ room, invite_code: inviteCode });
  } catch (err) {
    next(err);
  }
});

router.post('/dm', orgMiddleware, async (req, res, next) => {
  try {
    const { other_user_id } = req.body;
    if (!other_user_id) return res.status(400).json({ error: 'other_user_id required' });
    const otherMembership = await knex('memberships').where({ org_id: req.org.id, user_id: other_user_id }).first();
    if (!otherMembership) return res.status(404).json({ error: 'User not in org' });
    const userIds = [req.user.id, other_user_id].sort();
    const existing = await knex('rooms')
      .where({ org_id: req.org.id, room_type: 'dm' })
      .whereIn('id', function () {
        this.select('room_id').from('room_members').whereIn('user_id', userIds).groupBy('room_id').havingRaw('count(*) = 2');
      });
    let room = await knex('rooms')
      .where({ org_id: req.org.id, room_type: 'dm' })
      .whereExists(function () {
        this.select('*').from('room_members').whereRaw('room_members.room_id = rooms.id').where('user_id', req.user.id);
      })
      .whereExists(function () {
        this.select('*').from('room_members').whereRaw('room_members.room_id = rooms.id').where('user_id', other_user_id);
      })
      .first();
    if (room) return res.json({ room, existing: true });
    const roomId = uuidv4();
    await knex('rooms').insert({ id: roomId, org_id: req.org.id, room_type: 'dm', name: null });
    await knex('room_members').insert([
      { room_id: roomId, user_id: req.user.id, role: 'member' },
      { room_id: roomId, user_id: other_user_id, role: 'member' },
    ]);
    room = await knex('rooms').where('id', roomId).first();
    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/join', orgMiddleware, async (req, res, next) => {
  try {
    const { code } = req.body;
    const room = await knex('rooms').where('id', req.params.id).where('org_id', req.org.id).first();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.room_type === 'dm') return res.status(400).json({ error: 'Cannot join DM by code' });
    if (!code || room.invite_code !== code) return res.status(403).json({ error: 'Invalid invite code' });
    await knex('room_members').insert({ room_id: room.id, user_id: req.user.id, role: 'member' }).onConflict(['room_id', 'user_id']).ignore();
    res.json({ room, joined: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/attachment', orgMiddleware, upload.single('file'), async (req, res, next) => {
  try {
    const room = await knex('rooms').where('id', req.params.id).where('org_id', req.org.id).first();
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const member = await knex('room_members').where({ room_id: room.id, user_id: req.user.id }).first();
    if (!member) return res.status(403).json({ error: 'Not a member' });
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const { url, key } = await uploadToS3(req.file, 'chat-attachments');
    res.json({ url, key });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', orgMiddleware, async (req, res, next) => {
  try {
    const member = await knex('room_members').where({ room_id: req.params.id, user_id: req.user.id }).first();
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const before = req.query.before;
    let q = knex('messages').where('room_id', req.params.id).whereNull('deleted_at').orderBy('created_at', 'desc').limit(limit);
    if (before) q = q.where('created_at', '<', before);
    const messages = await q;
    res.json({ messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/messages/:msgId', orgMiddleware, async (req, res, next) => {
  try {
    const member = await knex('room_members').where({ room_id: req.params.id, user_id: req.user.id }).first();
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const msg = await knex('messages').where('id', req.params.msgId).where('room_id', req.params.id).first();
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Can only edit own message' });
    const { content } = req.body;
    await knex('messages').where('id', req.params.msgId).update({ content: content ?? msg.content, updated_at: new Date() });
    const updated = await knex('messages').where('id', req.params.msgId).first();
    res.json({ message: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/messages/:msgId', orgMiddleware, async (req, res, next) => {
  try {
    const member = await knex('room_members').where({ room_id: req.params.id, user_id: req.user.id }).first();
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const msg = await knex('messages').where('id', req.params.msgId).where('room_id', req.params.id).first();
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.user_id !== req.user.id && member.role !== 'admin') return res.status(403).json({ error: 'Cannot delete' });
    await knex('messages').where('id', req.params.msgId).update({ deleted_at: new Date(), content: '', updated_at: new Date() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/kick', orgMiddleware, async (req, res, next) => {
  try {
    const admin = await knex('room_members').where({ room_id: req.params.id, user_id: req.user.id }).first();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await knex('room_members').where({ room_id: req.params.id, user_id }).del();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
