import {
  USERNAME_COLORS,
  compressImageFile,
  ensureSessionId,
  generateRoomCode,
  getDefaultProfile,
  getProfile,
  parseRoomInput,
  saveProfile
} from './common.js';
import { renderColorSwatches } from './ui.js';

const profileModal = document.getElementById('profileModal');
const profileForm = document.getElementById('profileForm');
const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const usernameInput = document.getElementById('usernameInput');
const colorOptions = document.getElementById('colorOptions');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');

let draftProfile = getProfile() || getDefaultProfile();
let pendingRoomId = '';

ensureSessionId();

function refreshColorSwatches() {
  renderColorSwatches(colorOptions, USERNAME_COLORS, draftProfile.color, (color) => {
    draftProfile.color = color;
    refreshColorSwatches();
  });
}

function openProfileModal(roomId) {
  pendingRoomId = roomId;
  usernameInput.value = draftProfile.username || '';
  avatarPreview.src = draftProfile.avatar || '';
  profileModal.classList.remove('hidden');
}

function navigateToRoom(roomId) {
  window.location.href = `/room/${roomId}`;
}

function continueWithProfile(roomId) {
  const profile = getProfile();
  if (!profile?.username || !profile?.avatar || !profile?.color) {
    openProfileModal(roomId);
    return;
  }
  navigateToRoom(roomId);
}

refreshColorSwatches();
usernameInput.value = draftProfile.username || '';
if (draftProfile.avatar) avatarPreview.src = draftProfile.avatar;

createRoomBtn.addEventListener('click', () => continueWithProfile(generateRoomCode()));
joinRoomBtn.addEventListener('click', () => {
  const roomId = parseRoomInput(roomInput.value);
  if (!roomId) {
    roomInput.focus();
    return;
  }
  continueWithProfile(roomId);
});

avatarInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  draftProfile.avatar = await compressImageFile(file, 80, 0.82);
  avatarPreview.src = draftProfile.avatar;
});

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!draftProfile.avatar) {
    avatarInput.focus();
    return;
  }
  draftProfile.username = usernameInput.value.trim().slice(0, 20) || 'Guest';
  saveProfile(draftProfile);
  profileModal.classList.add('hidden');
  if (pendingRoomId) navigateToRoom(pendingRoomId);
});
