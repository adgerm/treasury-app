const { Server } = require('socket.io');
const { verifyAccessToken } = require('./auth-tokens');
const { knex } = require('./knex');
const { v4: uuidv4 } = require('uuid');

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Auth required'));
    const userId = verifyAccessToken(token);
    if (!userId) return next(new Error('Invalid token'));
    socket.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join_room', async (roomId, cb) => {
      const member = await knex('room_members')
        .where({ room_id: roomId, user_id: socket.userId })
        .first();
      if (!member) {
        if (typeof cb === 'function') cb({ error: 'Not a member of this room' });
        return;
      }
      socket.join(roomId);
      if (typeof cb === 'function') cb({ ok: true });
    });

    socket.on('message', async (payload, cb) => {
      const { room_id: roomId, content, attachment_url: attachmentUrl } = payload || {};
      if (!roomId) {
        if (typeof cb === 'function') cb({ error: 'room_id required' });
        return;
      }
      const member = await knex('room_members')
        .where({ room_id: roomId, user_id: socket.userId })
        .first();
      if (!member) {
        if (typeof cb === 'function') cb({ error: 'Not a member' });
        return;
      }
      const msg = {
        id: uuidv4(),
        room_id: roomId,
        user_id: socket.userId,
        content: content || '',
        attachment_url: attachmentUrl || null,
        attachment_s3_key: payload.attachment_s3_key || null,
      };
      await knex('messages').insert({
        id: msg.id,
        room_id: msg.room_id,
        user_id: msg.user_id,
        content: msg.content,
        attachment_url: msg.attachment_url,
        attachment_s3_key: msg.attachment_s3_key,
      });
      io.to(roomId).emit('message', msg);
      if (typeof cb === 'function') cb({ ok: true, id: msg.id });
    });
  });

  return io;
}

module.exports = { initSocket };
