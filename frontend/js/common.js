import { USERNAME_COLORS } from '/shared/constants.js';

const PROFILE_KEY = 'factors-chat-profile';
const SESSION_KEY = 'factors-chat-session';

export function ensureSessionId() {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function sanitizeText(value = '', max = 300) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs) return [hrs, mins, secs].map((part) => String(part).padStart(2, '0')).join(':');
  return [mins, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

export function generateRoomCode() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseRoomInput(value) {
  const input = sanitizeText(value, 120);
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts.at(-1) || '';
    } catch {
      return '';
    }
  }
  return input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
}

export function getRoomIdFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.at(-1) || '';
}

export function dataUrlToObjectUrl(dataUrl) {
  return dataUrl;
}

export async function compressImageFile(file, size = 80, quality = 0.82, mimeType = 'image/webp') {
  if (!file) return null;
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const scale = Math.max(size / imageBitmap.width, size / imageBitmap.height);
  const drawWidth = imageBitmap.width * scale;
  const drawHeight = imageBitmap.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(imageBitmap, dx, dy, drawWidth, drawHeight);
  return canvas.toDataURL(mimeType, quality);
}

export async function compressMessageImage(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  const maxSize = 900;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/webp', 0.78);
}

export function renderImagePreview(container, dataUrl) {
  container.innerHTML = '';
  if (!dataUrl) return;
  const img = document.createElement('img');
  img.src = dataUrl;
  img.alt = 'Selected image preview';
  img.className = 'preview-image';
  container.appendChild(img);
}

export function relativeTime(isoString) {
  const date = new Date(isoString);
  return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function getDefaultProfile() {
  return {
    username: '',
    color: USERNAME_COLORS[0],
    avatar: ''
  };
}

export { USERNAME_COLORS };
