const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

function sanitizeText(value = '', maxLength = 300) {
  return escapeHtml(String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength));
}

function sanitizeMultilineText(value = '', maxLength = 1000) {
  const normalized = String(value).replace(/\r/g, '').split('\n').map((line) => sanitizeText(line, maxLength)).join('\n');
  return normalized.slice(0, maxLength);
}

function sanitizeColor(value = '') {
  const color = String(value).trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e8ff47';
}

function sanitizeImageDataUrl(value = '', maxBytes = 350000) {
  if (typeof value !== 'string') return null;
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(value)) return null;
  const size = Buffer.byteLength(value, 'utf8');
  if (size > maxBytes) return null;
  return value;
}

function sanitizeUsername(value = '') {
  return sanitizeText(value, 20).replace(/[^\w\- .!?'#]/g, '').trim().slice(0, 20) || 'Guest';
}

function sanitizeVideoId(value = '') {
  const id = String(value).trim();
  return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
}

function sanitizeInteger(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= min && number <= max) return Math.floor(number);
  return fallback;
}

function safeTimestamp() {
  return new Date().toISOString();
}

module.exports = {
  escapeHtml,
  sanitizeText,
  sanitizeMultilineText,
  sanitizeColor,
  sanitizeImageDataUrl,
  sanitizeUsername,
  sanitizeVideoId,
  sanitizeInteger,
  safeTimestamp
};
