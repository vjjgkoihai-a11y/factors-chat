import {
  USERNAME_COLORS,
  compressImageFile,
  compressMessageImage,
  debounce,
  ensureSessionId,
  getDefaultProfile,
  getProfile,
  getRoomIdFromPath,
  renderImagePreview,
  saveProfile
} from './common.js';
import { searchYouTube, fetchAutocomplete } from './api.js';
import { connectSocket } from './socket.js';
import { state, setRoomSnapshot, findUser, getCurrentQueueItem, upsertDM } from './store.js';
import {
  renderAutocomplete,
  renderColorSwatches,
  renderDM,
  renderMessages,
  renderNowPlaying,
  renderPlayerTime,
  renderQueue,
  renderReactionBar,
  renderSearchResults,
  renderSeats,
  renderTypingIndicator,
  renderUserModal,
  renderUsers,
  showToast,
  spawnSeatReaction,
  spawnVideoReaction
} from './ui.js';
import { VoiceManager } from './voice.js';

const socket = connectSocket();
const roomId = getRoomIdFromPath();
const sessionId = ensureSessionId();
let player;
let voiceManager;
let playerReadyResolve;
let profileFormBound = false;
const playerReadyPromise = new Promise((resolve) => {
  playerReadyResolve = resolve;
});

const els = {
  roomTitle: document.getElementById('roomTitle'),
  tabs: document.getElementById('tabs'),
  tabPanels: [...document.querySelectorAll('.tab-panel')],
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  searchInput: document.getElementById('searchInput'),
  autocompleteList: document.getElementById('autocompleteList'),
  searchResults: document.getElementById('searchResults'),
  queueList: document.getElementById('queueList'),
  nowPlayingTitle: document.getElementById('nowPlayingTitle'),
  nowPlayingMeta: document.getElementById('nowPlayingMeta'),
  autoplayToggle: document.getElementById('autoplayToggle'),
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  chatImageInput: document.getElementById('chatImageInput'),
  chatImagePreview: document.getElementById('chatImagePreview'),
  typingIndicator: document.getElementById('typingIndicator'),
  usersList: document.getElementById('usersList'),
  seatsGrid: document.getElementById('seatsGrid'),
  reactionBar: document.getElementById('reactionBar'),
  videoReactionLayer: document.getElementById('videoReactionLayer'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  muteBtn: document.getElementById('muteBtn'),
  volumeSlider: document.getElementById('volumeSlider'),
  seekBar: document.getElementById('seekBar'),
  currentTime: document.getElementById('currentTime'),
  durationTime: document.getElementById('durationTime'),
  toastStack: document.getElementById('toastStack'),
  ownerPanel: document.getElementById('ownerPanel'),
  ownerPanelToggle: document.getElementById('ownerPanelToggle'),
  ownerPlayBtn: document.getElementById('ownerPlayBtn'),
  ownerPauseBtn: document.getElementById('ownerPauseBtn'),
  ownerSyncBtn: document.getElementById('ownerSyncBtn'),
  clearSeatsBtn: document.getElementById('clearSeatsBtn'),
  clearQueueBtn: document.getElementById('clearQueueBtn'),
  lockRoomBtn: document.getElementById('lockRoomBtn'),
  copyInviteBtn: document.getElementById('copyInviteBtn'),
  joinMicBtn: document.getElementById('joinMicBtn'),
  profileModal: document.getElementById('profileModal'),
  profileForm: document.getElementById('profileForm'),
  usernameInput: document.getElementById('usernameInput'),
  avatarInput: document.getElementById('avatarInput'),
  avatarPreview: document.getElementById('avatarPreview'),
  colorOptions: document.getElementById('colorOptions'),
  userModal: document.getElementById('userModal'),
  userModalContent: document.getElementById('userModalContent'),
  dmPanel: document.getElementById('dmPanel'),
  dmTitle: document.getElementById('dmTitle'),
  dmMessages: document.getElementById('dmMessages'),
  dmForm: document.getElementById('dmForm'),
  dmInput: document.getElementById('dmInput'),
  dmImageInput: document.getElementById('dmImageInput'),
  dmImagePreview: document.getElementById('dmImagePreview'),
  closeDmBtn: document.getElementById('closeDmBtn')
};

let profileDraft = getProfile() || getDefaultProfile();
state.profile = getProfile();
els.roomTitle.textContent = `FACTOR'S CHAT · ${roomId}`;

function notify(message, type = 'info') {
  if (message) showToast(els.toastStack, message, type);
}

function isOwner() {
  return Boolean(state.self?.socketId && state.self.socketId === state.room.ownerSocketId);
}

function mySeatIndex() {
  return state.room.users.find((user) => user.socketId === state.self?.socketId)?.seatIndex;
}

function refreshProfileSwatches() {
  renderColorSwatches(els.colorOptions, USERNAME_COLORS, profileDraft.color, (color) => {
    profileDraft.color = color;
    refreshProfileSwatches();
  });
}

function openProfileModal() {
  els.usernameInput.value = profileDraft.username || '';
  els.avatarPreview.src = profileDraft.avatar || '';
  refreshProfileSwatches();
  els.profileModal.classList.remove('hidden');
}

function closeProfileModal() {
  els.profileModal.classList.add('hidden');
}

function refreshDmView() {
  const targetSocketId = state.ui.selectedDmSocketId;
  const targetUser = targetSocketId ? findUser(targetSocketId) : null;
  const conversation = targetSocketId ? state.dms.get(targetSocketId) || [] : [];
  renderDM(els.dmTitle, els.dmMessages, conversation, state.self?.socketId, targetUser);
}

function renderAll() {
  renderSearchResults(els.searchResults, state.search.results, (video) => socket.emit('queue:add', { video }));
  renderAutocomplete(els.autocompleteList, state.search.suggestions, (query) => {
    els.searchInput.value = query;
    executeSearch(query);
  });
  renderQueue(els.queueList, state.room, isOwner(), (action, payload) => {
    if (action === 'play') socket.emit('queue:play-index', { index: payload.index });
    if (action === 'remove') socket.emit('queue:remove', { queueId: payload.queueId });
    if (action === 'move' && payload.fromIndex !== payload.toIndex) socket.emit('queue:reorder', payload);
  });
  renderUsers(els.usersList, state.room, openUserModal);
  renderSeats(els.seatsGrid, state.room, state.self?.socketId, handleSeatClick, openUserModal);
  renderReactionBar(els.reactionBar, typeof mySeatIndex() === 'number', (emoji) => socket.emit('reaction:send', { emoji }));
  renderMessages(els.chatMessages, state.room.chatMessages || []);
  renderTypingIndicator(els.typingIndicator, state.ui.typingUsers);
  renderNowPlaying(els.nowPlayingTitle, els.nowPlayingMeta, getCurrentQueueItem(), state.room.playback);
  els.autoplayToggle.checked = Boolean(state.room.playback.autoplay);
  els.ownerPanelToggle.style.display = isOwner() ? 'inline-flex' : 'none';
  els.lockRoomBtn.textContent = state.room.locked ? 'Unlock Room' : 'Lock Room';
  refreshDmView();
}

async function joinRoom() {
  socket.emit('room:join', { roomId, profile: { ...state.profile, sessionId } }, async (response) => {
    if (!response?.ok) {
      notify(response?.error || 'Unable to join the room.', 'warning');
      return;
    }
    state.self = response.self;
    setRoomSnapshot(response.room);
    renderAll();
    await playerReadyPromise;
    await syncPlayerToRoom(true);
  });
}

function ensureProfileAndJoin() {
  state.profile = getProfile();
  if (!state.profile?.username || !state.profile?.avatar || !state.profile?.color) {
    openProfileModal();
    return;
  }
  joinRoom();
}

async function executeSearch(query = els.searchInput.value.trim()) {
  if (!query) {
    state.search.results = [];
    state.search.suggestions = [];
    renderAll();
    return;
  }
  try {
    const [results, suggestions] = await Promise.all([searchYouTube(query), fetchAutocomplete(query)]);
    state.search.results = results;
    state.search.suggestions = suggestions;
    renderAll();
  } catch (error) {
    notify(error.message || 'Search failed.', 'warning');
  }
}

const debouncedSearch = debounce(() => executeSearch(), 350);

function getEffectivePlaybackTime(playback = state.room.playback) {
  const updatedAt = typeof playback.updatedAt === 'number' ? playback.updatedAt : new Date(playback.updatedAt).getTime();
  if (!playback.playing) return playback.time || 0;
  return (playback.time || 0) + Math.max(0, (Date.now() - updatedAt) / 1000);
}

function setPlayerSuppressed(duration = 800) {
  state.suppressPlayerEvent = true;
  setTimeout(() => {
    state.suppressPlayerEvent = false;
  }, duration);
}

async function syncPlayerToRoom(force = false) {
  if (!state.playerReady || !player) return;
  const currentItem = getCurrentQueueItem();
  const playback = state.room.playback;
  if (!currentItem || !playback.videoId) {
    renderPlayerTime(els.currentTime, els.durationTime, els.seekBar, 0, 0);
    return;
  }

  const currentVideoId = player.getVideoData?.().video_id;
  const targetTime = getEffectivePlaybackTime(playback);

  if (force || currentVideoId !== playback.videoId) {
    setPlayerSuppressed(1200);
    player.loadVideoById({ videoId: playback.videoId, startSeconds: Math.max(0, targetTime) });
    if (!playback.playing) player.pauseVideo();
    return;
  }

  const currentTime = player.getCurrentTime?.() || 0;
  if (Math.abs(currentTime - targetTime) > 1.5) {
    setPlayerSuppressed();
    player.seekTo(targetTime, true);
  }

  if (playback.playing && player.getPlayerState() !== YT.PlayerState.PLAYING) {
    setPlayerSuppressed();
    player.playVideo();
  }
  if (!playback.playing && player.getPlayerState() === YT.PlayerState.PLAYING) {
    setPlayerSuppressed();
    player.pauseVideo();
  }
}

function withOwnerGuard(fn) {
  if (!isOwner()) {
    notify('Only the owner can use that control.', 'warning');
    return;
  }
  fn();
}

function openUserModal(socketId) {
  const user = findUser(socketId);
  if (!user) return;
  state.ui.userModalSocketId = socketId;
  renderUserModal(els.userModalContent, user, socketId === state.self?.socketId, isOwner(), state.room.ownerSocketId);
  els.userModal.classList.remove('hidden');
}

function closeUserModal() {
  state.ui.userModalSocketId = null;
  els.userModal.classList.add('hidden');
}

function handleSeatClick(index, occupant) {
  if (!occupant) socket.emit('seat:take', { seatIndex: index });
  else if (occupant.socketId === state.self?.socketId) socket.emit('seat:leave');
}

function setupPlayer() {
  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('player', {
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => {
          event.target.setVolume(Number(els.volumeSlider.value));
          state.playerReady = true;
          playerReadyResolve();
          setInterval(() => {
            if (!state.playerReady || !player) return;
            const current = player.getCurrentTime?.() || 0;
            const duration = player.getDuration?.() || 0;
            renderPlayerTime(els.currentTime, els.durationTime, els.seekBar, current, duration);
            els.playPauseBtn.textContent = player.getPlayerState?.() === YT.PlayerState.PLAYING ? '⏸' : '▶';
          }, 300);
        },
        onStateChange: (event) => {
          if (state.suppressPlayerEvent || !isOwner()) return;
          if (event.data === YT.PlayerState.PLAYING) {
            socket.emit('player:control', { action: 'play', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked });
          }
          if (event.data === YT.PlayerState.PAUSED) {
            socket.emit('player:control', { action: 'pause', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked });
          }
          if (event.data === YT.PlayerState.ENDED) {
            socket.emit('player:control', { action: 'ended', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked });
          }
        }
      }
    });
  };

  if (window.YT?.Player) window.onYouTubeIframeAPIReady();
}

function setupProfileForm() {
  if (profileFormBound) return;
  profileFormBound = true;
  refreshProfileSwatches();
  if (profileDraft.avatar) els.avatarPreview.src = profileDraft.avatar;

  els.avatarInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    profileDraft.avatar = await compressImageFile(file, 80, 0.82);
    els.avatarPreview.src = profileDraft.avatar;
  });

  els.profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!profileDraft.avatar) {
      notify('Please upload a profile photo.', 'warning');
      return;
    }
    profileDraft.username = els.usernameInput.value.trim().slice(0, 20) || 'Guest';
    saveProfile(profileDraft);
    state.profile = profileDraft;
    closeProfileModal();
    joinRoom();
  });
}

function setupTabs() {
  els.tabs.addEventListener('click', (event) => {
    const button = event.target.closest('.tab');
    if (!button) return;
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    els.tabPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
    if (window.innerWidth <= 940) els.sidebar.classList.remove('open');
  });
}

function setupInteractions() {
  els.sidebarToggle.addEventListener('click', () => els.sidebar.classList.toggle('open'));

  els.searchInput.addEventListener('input', debouncedSearch);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      executeSearch();
    }
  });

  els.chatInput.addEventListener('input', debounce(() => socket.emit('chat:typing'), 80));
  els.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    socket.emit('chat:send', { text: els.chatInput.value, image: state.ui.pendingChatImage });
    els.chatInput.value = '';
    state.ui.pendingChatImage = null;
    renderImagePreview(els.chatImagePreview, null);
    els.chatImageInput.value = '';
  });
  els.chatImageInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.ui.pendingChatImage = await compressMessageImage(file);
    renderImagePreview(els.chatImagePreview, state.ui.pendingChatImage);
  });

  els.dmForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.ui.selectedDmSocketId) return;
    socket.emit('dm:send', { targetSocketId: state.ui.selectedDmSocketId, text: els.dmInput.value, image: state.ui.pendingDmImage });
    els.dmInput.value = '';
    state.ui.pendingDmImage = null;
    renderImagePreview(els.dmImagePreview, null);
    els.dmImageInput.value = '';
  });
  els.dmImageInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.ui.pendingDmImage = await compressMessageImage(file);
    renderImagePreview(els.dmImagePreview, state.ui.pendingDmImage);
  });
  els.closeDmBtn.addEventListener('click', () => els.dmPanel.classList.add('hidden'));

  els.copyInviteBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(window.location.href);
    notify('Invite link copied.', 'success');
  });

  els.ownerPanelToggle.addEventListener('click', () => {
    if (isOwner()) els.ownerPanel.classList.toggle('hidden');
  });
  els.ownerPlayBtn.addEventListener('click', () => withOwnerGuard(() => player.playVideo()));
  els.ownerPauseBtn.addEventListener('click', () => withOwnerGuard(() => player.pauseVideo()));
  els.ownerSyncBtn.addEventListener('click', () => withOwnerGuard(() => socket.emit('player:control', { action: 'seek', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked })));
  els.clearSeatsBtn.addEventListener('click', () => withOwnerGuard(() => state.room.seats.forEach((seat, index) => seat && socket.emit('seat:remove', { seatIndex: index }))));
  els.clearQueueBtn.addEventListener('click', () => withOwnerGuard(() => socket.emit('queue:clear')));
  els.lockRoomBtn.addEventListener('click', () => withOwnerGuard(() => socket.emit('room:lock', { locked: !state.room.locked })));
  els.autoplayToggle.addEventListener('change', () => withOwnerGuard(() => socket.emit('player:control', { action: player.getPlayerState() === YT.PlayerState.PLAYING ? 'play' : 'pause', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked })));

  els.playPauseBtn.addEventListener('click', () => withOwnerGuard(() => {
    if (player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    else player.playVideo();
  }));
  els.prevBtn.addEventListener('click', () => withOwnerGuard(() => socket.emit('player:control', { action: 'prev', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked })));
  els.nextBtn.addEventListener('click', () => withOwnerGuard(() => socket.emit('player:control', { action: 'next', time: player.getCurrentTime(), autoplay: els.autoplayToggle.checked })));
  els.muteBtn.addEventListener('click', () => {
    if (!player) return;
    if (player.isMuted()) {
      player.unMute();
      els.muteBtn.textContent = '🔊';
    } else {
      player.mute();
      els.muteBtn.textContent = '🔇';
    }
  });
  els.volumeSlider.addEventListener('input', () => player?.setVolume(Number(els.volumeSlider.value)));
  els.seekBar.addEventListener('change', () => withOwnerGuard(() => {
    const duration = player.getDuration?.() || 0;
    const time = duration * (Number(els.seekBar.value) / 1000);
    setPlayerSuppressed();
    player.seekTo(time, true);
    socket.emit('player:control', { action: 'seek', time, autoplay: els.autoplayToggle.checked });
  }));

  els.userModal.addEventListener('click', (event) => {
    if (event.target === els.userModal) closeUserModal();
    const action = event.target.dataset.action;
    const user = findUser(state.ui.userModalSocketId);
    if (!action || !user) return;
    if (action === 'close') closeUserModal();
    if (action === 'dm') {
      state.ui.selectedDmSocketId = user.socketId;
      els.dmPanel.classList.remove('hidden');
      refreshDmView();
      closeUserModal();
    }
    if (action === 'leave-seat') {
      socket.emit('seat:leave');
      closeUserModal();
    }
    if (action === 'remove-seat' && typeof user.seatIndex === 'number') {
      socket.emit('seat:remove', { seatIndex: user.seatIndex });
      closeUserModal();
    }
    if (action === 'transfer-owner') {
      socket.emit('owner:transfer', { targetSocketId: user.socketId });
      closeUserModal();
    }
    if (action === 'kick') {
      socket.emit('room:kick', { targetSocketId: user.socketId });
      closeUserModal();
    }
  });

  voiceManager = new VoiceManager(socket, (joined) => {
    state.ui.micJoined = joined;
    els.joinMicBtn.textContent = joined ? 'Leave Mic' : 'Join Mic';
  });
  els.joinMicBtn.addEventListener('click', async () => {
    try {
      if (state.ui.micJoined) await voiceManager.leave();
      else await voiceManager.join();
    } catch (error) {
      notify(error.message || 'Microphone access was blocked.', 'warning');
    }
  });
}

socket.on('room:snapshot', async (snapshot) => {
  setRoomSnapshot(snapshot);
  renderAll();
  await syncPlayerToRoom();
});

socket.on('room:user-joined', ({ message }) => notify(message, 'success'));
socket.on('room:user-left', ({ message }) => notify(message, 'info'));
socket.on('chat:new', (message) => {
  state.room.chatMessages = [...(state.room.chatMessages || []), message].slice(-50);
  renderMessages(els.chatMessages, state.room.chatMessages);
});
socket.on('chat:typing', ({ socketId, username }) => {
  if (socketId === state.self?.socketId) return;
  state.ui.typingUsers.set(socketId, username);
  renderTypingIndicator(els.typingIndicator, state.ui.typingUsers);
  setTimeout(() => {
    state.ui.typingUsers.delete(socketId);
    renderTypingIndicator(els.typingIndicator, state.ui.typingUsers);
  }, 5000);
});
socket.on('reaction:new', ({ emoji, seatIndex }) => {
  const seatNode = els.seatsGrid.children[seatIndex];
  if (seatNode) spawnSeatReaction(seatNode, emoji);
  spawnVideoReaction(els.videoReactionLayer, emoji);
});
socket.on('player:load', async ({ videoId }) => {
  state.room.playback.videoId = videoId;
  await syncPlayerToRoom(true);
});
socket.on('player:state', async (playback) => {
  state.room.playback = playback;
  renderAll();
  await syncPlayerToRoom();
});
socket.on('system:toast', ({ message, type }) => notify(message, type || 'info'));
socket.on('system:error', ({ message }) => notify(message, 'warning'));
socket.on('system:kicked', ({ message }) => {
  notify(message, 'warning');
  setTimeout(() => {
    window.location.href = '/';
  }, 1200);
});
socket.on('dm:new', (message) => {
  upsertDM(message);
  const otherSocketId = message.from.socketId === state.self?.socketId ? message.to.socketId : message.from.socketId;
  if (message.from.socketId !== state.self?.socketId) notify(`New DM from ${message.from.username}`, 'info');
  if (state.ui.selectedDmSocketId === otherSocketId) els.dmPanel.classList.remove('hidden');
  refreshDmView();
});
socket.on('voice:participants', async (participants) => {
  await voiceManager.handleParticipants(participants);
});
socket.on('voice:user-left', ({ socketId }) => {
  voiceManager.cleanupPeer(socketId);
});
socket.on('voice:speaking', ({ socketId, speaking }) => {
  const user = findUser(socketId);
  if (!user) return;
  user.speaking = speaking;
  renderAll();
});
socket.on('webrtc:offer', async ({ fromSocketId, sdp }) => {
  await voiceManager.handleOffer(fromSocketId, sdp);
});
socket.on('webrtc:answer', async ({ fromSocketId, sdp }) => {
  await voiceManager.handleAnswer(fromSocketId, sdp);
});
socket.on('webrtc:ice', async ({ fromSocketId, candidate }) => {
  await voiceManager.handleIce(fromSocketId, candidate);
});

setupProfileForm();
setupTabs();
setupInteractions();
setupPlayer();
ensureProfileAndJoin();
