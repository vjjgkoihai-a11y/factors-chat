const {
  getRoom,
  addUser,
  getUser,
  takeSeat,
  clearUserSeat,
  clearSeat,
  removeUser,
  transferOwnership,
  addChatMessage,
  addQueueItem,
  removeQueueItem,
  clearQueue,
  reorderQueue,
  setCurrentIndex,
  updatePlayback,
  serializeRoom,
  cleanupRooms
} = require('./roomStore');
const {
  sanitizeColor,
  sanitizeImageDataUrl,
  sanitizeInteger,
  sanitizeMultilineText,
  sanitizeText,
  sanitizeUsername,
  sanitizeVideoId
} = require('../utils/sanitize');

const REACTIONS = new Set(['❤️', '😂', '🔥', '😮', '😍', '💋', '👏', '🥰', '😭', '🤣']);

function createRateLimiter(maxEvents = 25, windowMs = 1000) {
  return (socket, next) => {
    const now = Date.now();
    if (!socket.data.rateWindow || now - socket.data.rateWindow.start >= windowMs) {
      socket.data.rateWindow = { start: now, count: 0 };
    }
    socket.data.rateWindow.count += 1;
    if (socket.data.rateWindow.count > maxEvents) {
      socket.emit('system:error', { message: 'Rate limit exceeded. Slow down a little.' });
      return;
    }
    next();
  };
}

function emitRoom(io, room) {
  io.to(room.id).emit('room:snapshot', serializeRoom(room));
}

function createPublicUser(user, room) {
  return {
    socketId: user.socketId,
    sessionId: user.sessionId,
    username: user.username,
    color: user.color,
    avatar: user.avatar,
    seatIndex: user.seatIndex,
    owner: room.ownerSocketId === user.socketId,
    mic: Boolean(user.mic),
    speaking: Boolean(user.speaking)
  };
}

function initSocket(io) {
  io.use(createRateLimiter());

  io.on('connection', (socket) => {
    socket.on('room:join', ({ roomId, profile }, callback = () => {}) => {
      try {
        const safeRoomId = sanitizeText(roomId || '', 32).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
        if (!safeRoomId) {
          return callback({ ok: false, error: 'Invalid room id.' });
        }

        const room = getRoom(safeRoomId);
        const sessionId = sanitizeText(profile?.sessionId || '', 64).replace(/[^a-zA-Z0-9_-]/g, '');
        if (!sessionId) {
          return callback({ ok: false, error: 'Missing session id.' });
        }
        if (room.bannedSessionIds.has(sessionId)) {
          return callback({ ok: false, error: 'You are banned from this room for this session.' });
        }
        if (room.locked && !room.admittedSessionIds.has(sessionId)) {
          return callback({ ok: false, error: 'This room is currently locked.' });
        }

        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.sessionId = sessionId;

        const user = {
          socketId: socket.id,
          sessionId,
          username: sanitizeUsername(profile?.username || 'Guest'),
          color: sanitizeColor(profile?.color),
          avatar: sanitizeImageDataUrl(profile?.avatar, 220000),
          seatIndex: null,
          joinedAt: Date.now(),
          mic: false,
          speaking: false
        };

        addUser(room, user);
        callback({ ok: true, room: serializeRoom(room), self: createPublicUser(user, room) });
        socket.to(room.id).emit('room:user-joined', {
          user: createPublicUser(user, room),
          message: `${user.username} joined the room.`
        });
        emitRoom(io, room);
      } catch (error) {
        callback({ ok: false, error: error.message || 'Unable to join room.' });
      }
    });

    socket.on('seat:take', ({ seatIndex }) => {
      const room = getRoom(socket.data.roomId);
      if (!room) return;
      const index = sanitizeInteger(seatIndex, 0, 9, -1);
      if (index === -1) return;
      if (takeSeat(room, socket.id, index)) {
        emitRoom(io, room);
      }
    });

    socket.on('seat:leave', () => {
      const room = getRoom(socket.data.roomId);
      if (!room) return;
      if (clearUserSeat(room, socket.id)) emitRoom(io, room);
    });

    socket.on('seat:remove', ({ seatIndex }) => {
      const room = getRoom(socket.data.roomId);
      const actor = room && getUser(room, socket.id);
      if (!room || !actor || room.ownerSocketId !== socket.id) return;
      const index = sanitizeInteger(seatIndex, 0, 9, -1);
      if (index === -1) return;
      const removedUser = clearSeat(room, index);
      if (removedUser) {
        io.to(removedUser.socketId).emit('system:toast', { type: 'warning', message: 'The owner removed you from your seat.' });
        emitRoom(io, room);
      }
    });

    socket.on('reaction:send', ({ emoji }) => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user || typeof user.seatIndex !== 'number' || !REACTIONS.has(emoji)) return;
      io.to(room.id).emit('reaction:new', {
        emoji,
        seatIndex: user.seatIndex,
        user: createPublicUser(user, room),
        createdAt: Date.now()
      });
    });

    socket.on('chat:typing', () => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user) return;
      socket.to(room.id).emit('chat:typing', { socketId: socket.id, username: user.username });
    });

    socket.on('chat:send', ({ text, image }) => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user) return;
      const messageText = sanitizeMultilineText(text || '', 500);
      const safeImage = sanitizeImageDataUrl(image, 350000);
      if (!messageText && !safeImage) return;
      const message = addChatMessage(room, {
        type: 'public',
        text: messageText,
        image: safeImage,
        user: createPublicUser(user, room)
      });
      io.to(room.id).emit('chat:new', message);
      emitRoom(io, room);
    });

    socket.on('dm:send', ({ targetSocketId, text, image }) => {
      const room = getRoom(socket.data.roomId);
      const sender = room && getUser(room, socket.id);
      const target = room?.users.get(targetSocketId);
      if (!room || !sender || !target) return;
      const messageText = sanitizeMultilineText(text || '', 500);
      const safeImage = sanitizeImageDataUrl(image, 350000);
      if (!messageText && !safeImage) return;
      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdAt: new Date().toISOString(),
        text: messageText,
        image: safeImage,
        from: createPublicUser(sender, room),
        to: createPublicUser(target, room)
      };
      io.to(target.socketId).emit('dm:new', payload);
      io.to(sender.socketId).emit('dm:new', payload);
    });

    socket.on('room:lock', ({ locked }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      room.locked = Boolean(locked);
      emitRoom(io, room);
      io.to(room.id).emit('system:toast', { type: 'info', message: `Room ${room.locked ? 'locked' : 'unlocked'} by owner.` });
    });

    socket.on('room:kick', ({ targetSocketId }) => {
      const room = getRoom(socket.data.roomId);
      const actor = room && getUser(room, socket.id);
      const target = room?.users.get(targetSocketId);
      if (!room || !actor || !target || room.ownerSocketId !== socket.id || target.socketId === socket.id) return;
      room.bannedSessionIds.add(target.sessionId);
      io.to(target.socketId).emit('system:kicked', { message: 'You were removed by the owner.' });
      io.sockets.sockets.get(target.socketId)?.disconnect(true);
    });

    socket.on('owner:transfer', ({ targetSocketId }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      const owner = transferOwnership(room, targetSocketId);
      if (owner) {
        io.to(room.id).emit('system:toast', { type: 'success', message: `${owner.username} is now the owner.` });
        emitRoom(io, room);
      }
    });

    socket.on('queue:add', ({ video }) => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user) return;
      const queueItem = addQueueItem(room, {
        videoId: sanitizeVideoId(video?.id),
        title: sanitizeText(video?.title || '', 160),
        channel: sanitizeText(video?.channel || '', 120),
        duration: sanitizeText(video?.duration || '', 24),
        thumbnail: sanitizeText(video?.thumbnail || '', 500),
        views: sanitizeText(video?.views || '', 60),
        addedBy: user.username,
        addedBySessionId: user.sessionId
      });
      if (!queueItem) {
        socket.emit('system:error', { message: 'Queue is full or invalid video.' });
        return;
      }
      if (room.currentIndex === 0 && !room.playback.videoId) {
        setCurrentIndex(room, 0);
      }
      emitRoom(io, room);
      io.to(room.id).emit('system:toast', { type: 'success', message: `${user.username} added “${queueItem.title}”.` });
    });

    socket.on('queue:remove', ({ queueId }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      if (removeQueueItem(room, sanitizeText(queueId || '', 80))) emitRoom(io, room);
    });

    socket.on('queue:clear', () => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      clearQueue(room);
      emitRoom(io, room);
    });

    socket.on('queue:reorder', ({ fromIndex, toIndex }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      if (reorderQueue(room, sanitizeInteger(fromIndex, 0, 49, -1), sanitizeInteger(toIndex, 0, 49, -1))) emitRoom(io, room);
    });

    socket.on('queue:play-index', ({ index }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;
      const current = setCurrentIndex(room, sanitizeInteger(index, 0, 49, -1));
      if (current) {
        io.to(room.id).emit('player:load', { videoId: current.videoId, index: room.currentIndex, autoplay: room.playback.autoplay });
        emitRoom(io, room);
      }
    });

    socket.on('player:control', ({ action, time, autoplay }) => {
      const room = getRoom(socket.data.roomId);
      if (!room || room.ownerSocketId !== socket.id) return;

      if (typeof autoplay === 'boolean') {
        updatePlayback(room, { autoplay });
      }

      if (action === 'play') {
        updatePlayback(room, { playing: true, time: Number(time) || 0 });
      } else if (action === 'pause') {
        updatePlayback(room, { playing: false, time: Number(time) || 0 });
      } else if (action === 'seek') {
        updatePlayback(room, { time: Number(time) || 0 });
      } else if (action === 'ended') {
        const nextIndex = room.currentIndex + 1;
        if (room.playback.autoplay && nextIndex < room.queue.length) {
          const current = setCurrentIndex(room, nextIndex);
          io.to(room.id).emit('player:load', { videoId: current.videoId, index: room.currentIndex, autoplay: true });
        } else {
          updatePlayback(room, { playing: false, time: Number(time) || 0 });
        }
      } else if (action === 'next') {
        const nextIndex = Math.min(room.currentIndex + 1, room.queue.length - 1);
        const current = setCurrentIndex(room, nextIndex);
        if (current) io.to(room.id).emit('player:load', { videoId: current.videoId, index: room.currentIndex, autoplay: room.playback.autoplay });
      } else if (action === 'prev') {
        const prevIndex = Math.max(room.currentIndex - 1, 0);
        const current = setCurrentIndex(room, prevIndex);
        if (current) io.to(room.id).emit('player:load', { videoId: current.videoId, index: room.currentIndex, autoplay: room.playback.autoplay });
      }

      io.to(room.id).emit('player:state', room.playback);
      emitRoom(io, room);
    });

    socket.on('voice:join', () => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user) return;
      user.mic = true;
      user.speaking = false;
      socket.emit('voice:participants', room.users.size ? [...room.users.values()].filter((entry) => entry.socketId !== socket.id && entry.mic).map((entry) => ({ socketId: entry.socketId })) : []);
      socket.to(room.id).emit('voice:user-joined', { socketId: socket.id });
      emitRoom(io, room);
    });

    socket.on('voice:leave', () => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user) return;
      user.mic = false;
      user.speaking = false;
      socket.to(room.id).emit('voice:user-left', { socketId: socket.id });
      emitRoom(io, room);
    });

    socket.on('voice:speaking', ({ speaking }) => {
      const room = getRoom(socket.data.roomId);
      const user = room && getUser(room, socket.id);
      if (!room || !user || !user.mic) return;
      user.speaking = Boolean(speaking);
      io.to(room.id).emit('voice:speaking', { socketId: socket.id, speaking: user.speaking });
    });

    socket.on('webrtc:offer', ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit('webrtc:offer', { fromSocketId: socket.id, sdp });
    });

    socket.on('webrtc:answer', ({ targetSocketId, sdp }) => {
      io.to(targetSocketId).emit('webrtc:answer', { fromSocketId: socket.id, sdp });
    });

    socket.on('webrtc:ice', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice', { fromSocketId: socket.id, candidate });
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      const user = removeUser(room, socket.id);
      if (!user) return;
      socket.to(room.id).emit('voice:user-left', { socketId: socket.id });
      socket.to(room.id).emit('room:user-left', { user: createPublicUser(user, room), message: `${user.username} left the room.` });
      emitRoom(io, room);
    });
  });

  setInterval(() => cleanupRooms(), 60_000).unref();
}

module.exports = { initSocket };
