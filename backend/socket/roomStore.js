const { randomUUID } = require('crypto');
const { safeTimestamp } = require('../utils/sanitize');

const MAX_CHAT_MESSAGES = 50;
const MAX_QUEUE_ITEMS = 50;
const SEAT_COUNT = 10;

const rooms = new Map();

function createRoom(roomId) {
  const room = {
    id: roomId,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    ownerSocketId: null,
    ownerSessionId: null,
    locked: false,
    admittedSessionIds: new Set(),
    bannedSessionIds: new Set(),
    users: new Map(),
    seats: Array(SEAT_COUNT).fill(null),
    chatMessages: [],
    queue: [],
    currentIndex: -1,
    playback: {
      videoId: null,
      playing: false,
      time: 0,
      updatedAt: Date.now(),
      autoplay: true
    }
  };

  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || createRoom(roomId);
}

function markActive(room) {
  room.lastActiveAt = Date.now();
}

function addUser(room, user) {
  room.users.set(user.socketId, user);
  room.admittedSessionIds.add(user.sessionId);
  markActive(room);

  if (!room.ownerSocketId || !room.ownerSessionId) {
    room.ownerSocketId = user.socketId;
    room.ownerSessionId = user.sessionId;
  }
}

function getUser(room, socketId) {
  return room.users.get(socketId) || null;
}

function takeSeat(room, socketId, seatIndex) {
  if (seatIndex < 0 || seatIndex >= SEAT_COUNT) return false;
  if (room.seats[seatIndex]) return false;
  const user = getUser(room, socketId);
  if (!user) return false;

  if (typeof user.seatIndex === 'number') {
    room.seats[user.seatIndex] = null;
  }

  room.seats[seatIndex] = socketId;
  user.seatIndex = seatIndex;
  markActive(room);
  return true;
}

function clearUserSeat(room, socketId) {
  const user = getUser(room, socketId);
  if (!user || typeof user.seatIndex !== 'number') return false;
  room.seats[user.seatIndex] = null;
  user.seatIndex = null;
  markActive(room);
  return true;
}

function clearSeat(room, seatIndex) {
  const socketId = room.seats[seatIndex];
  if (!socketId) return null;
  clearUserSeat(room, socketId);
  return room.users.get(socketId) || null;
}

function removeUser(room, socketId) {
  const user = room.users.get(socketId);
  if (!user) return null;

  clearUserSeat(room, socketId);
  room.users.delete(socketId);
  markActive(room);

  if (room.ownerSocketId === socketId) {
    transferOwnershipToNext(room);
  }

  return user;
}

function transferOwnershipToNext(room) {
  const nextOwner = [...room.users.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0] || null;
  room.ownerSocketId = nextOwner?.socketId || null;
  room.ownerSessionId = nextOwner?.sessionId || null;
  markActive(room);
  return nextOwner;
}

function transferOwnership(room, targetSocketId) {
  const target = room.users.get(targetSocketId);
  if (!target) return null;
  room.ownerSocketId = target.socketId;
  room.ownerSessionId = target.sessionId;
  markActive(room);
  return target;
}

function addChatMessage(room, message) {
  room.chatMessages.push({ ...message, id: randomUUID(), createdAt: safeTimestamp() });
  room.chatMessages = room.chatMessages.slice(-MAX_CHAT_MESSAGES);
  markActive(room);
  return room.chatMessages.at(-1);
}

function addQueueItem(room, item) {
  if (room.queue.length >= MAX_QUEUE_ITEMS || !item?.videoId || !item?.title) return null;
  const queueItem = {
    ...item,
    queueId: randomUUID(),
    addedAt: safeTimestamp()
  };
  room.queue.push(queueItem);
  if (room.currentIndex === -1) room.currentIndex = 0;
  markActive(room);
  return queueItem;
}

function removeQueueItem(room, queueId) {
  const index = room.queue.findIndex((item) => item.queueId === queueId);
  if (index === -1) return false;
  room.queue.splice(index, 1);
  if (!room.queue.length) {
    room.currentIndex = -1;
    room.playback = { ...room.playback, videoId: null, playing: false, time: 0, updatedAt: Date.now() };
    markActive(room);
    return true;
  }
  if (index < room.currentIndex) {
    room.currentIndex -= 1;
  } else if (index === room.currentIndex) {
    room.currentIndex = Math.min(room.currentIndex, room.queue.length - 1);
    room.playback = {
      ...room.playback,
      videoId: room.queue[room.currentIndex]?.videoId || null,
      playing: false,
      time: 0,
      updatedAt: Date.now()
    };
  } else if (room.currentIndex >= room.queue.length) {
    room.currentIndex = room.queue.length - 1;
  }
  markActive(room);
  return true;
}

function clearQueue(room) {
  room.queue = [];
  room.currentIndex = -1;
  room.playback = { ...room.playback, videoId: null, playing: false, time: 0, updatedAt: Date.now() };
  markActive(room);
}

function reorderQueue(room, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= room.queue.length || toIndex < 0 || toIndex >= room.queue.length) {
    return false;
  }
  const [moved] = room.queue.splice(fromIndex, 1);
  room.queue.splice(toIndex, 0, moved);
  if (room.currentIndex === fromIndex) room.currentIndex = toIndex;
  else if (fromIndex < room.currentIndex && toIndex >= room.currentIndex) room.currentIndex -= 1;
  else if (fromIndex > room.currentIndex && toIndex <= room.currentIndex) room.currentIndex += 1;
  markActive(room);
  return true;
}

function setCurrentIndex(room, index) {
  if (index < 0 || index >= room.queue.length) return null;
  room.currentIndex = index;
  const current = room.queue[index];
  room.playback = {
    ...room.playback,
    videoId: current.videoId,
    time: 0,
    playing: false,
    updatedAt: Date.now()
  };
  markActive(room);
  return current;
}

function updatePlayback(room, patch) {
  room.playback = {
    ...room.playback,
    ...patch,
    updatedAt: Date.now()
  };
  markActive(room);
  return room.playback;
}

function serializeRoom(room) {
  return {
    id: room.id,
    ownerSocketId: room.ownerSocketId,
    ownerSessionId: room.ownerSessionId,
    locked: room.locked,
    seats: room.seats,
    users: [...room.users.values()].map((user) => ({
      socketId: user.socketId,
      sessionId: user.sessionId,
      username: user.username,
      color: user.color,
      avatar: user.avatar,
      seatIndex: user.seatIndex,
      joinedAt: user.joinedAt,
      mic: Boolean(user.mic),
      speaking: Boolean(user.speaking)
    })),
    chatMessages: room.chatMessages,
    queue: room.queue,
    currentIndex: room.currentIndex,
    playback: room.playback
  };
}

function cleanupRooms(maxIdleMs = 5 * 60 * 1000) {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (!room.users.size && now - room.lastActiveAt > maxIdleMs) {
      rooms.delete(roomId);
    }
  }
}

module.exports = {
  rooms,
  getRoom,
  addUser,
  getUser,
  takeSeat,
  clearUserSeat,
  clearSeat,
  removeUser,
  transferOwnership,
  transferOwnershipToNext,
  addChatMessage,
  addQueueItem,
  removeQueueItem,
  clearQueue,
  reorderQueue,
  setCurrentIndex,
  updatePlayback,
  serializeRoom,
  cleanupRooms
};
