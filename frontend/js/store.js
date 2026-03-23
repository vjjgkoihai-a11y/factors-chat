export const state = {
  profile: null,
  self: null,
  room: {
    id: '',
    ownerSocketId: null,
    locked: false,
    seats: Array(10).fill(null),
    users: [],
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
  },
  search: {
    results: [],
    suggestions: []
  },
  ui: {
    selectedDmSocketId: null,
    typingUsers: new Map(),
    sidebarOpen: false,
    userModalSocketId: null,
    pendingChatImage: null,
    pendingDmImage: null,
    micJoined: false
  },
  dms: new Map(),
  playerReady: false,
  suppressPlayerEvent: false,
  lastSyncedAt: 0
};

export function setRoomSnapshot(snapshot) {
  state.room = snapshot;
}

export function findUser(socketId) {
  return state.room.users.find((user) => user.socketId === socketId) || null;
}

export function getCurrentQueueItem() {
  return state.room.queue[state.room.currentIndex] || null;
}

export function upsertDM(message) {
  const otherSocketId = message.from.socketId === state.self?.socketId ? message.to.socketId : message.from.socketId;
  const list = state.dms.get(otherSocketId) || [];
  list.push(message);
  state.dms.set(otherSocketId, list.slice(-50));
}
