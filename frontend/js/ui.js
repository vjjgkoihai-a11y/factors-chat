import { REACTIONS } from '/shared/constants.js';
import { formatTime, relativeTime } from './common.js';

export function renderColorSwatches(container, colors, selected, onSelect) {
  container.innerHTML = '';
  colors.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `color-swatch ${selected === color ? 'active' : ''}`;
    button.style.background = color;
    button.addEventListener('click', () => onSelect(color));
    container.appendChild(button);
  });
}

export function showToast(container, message, type = 'info') {
  const toast = document.createElement('article');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 3800);
}

export function renderSearchResults(container, results, onAdd) {
  container.innerHTML = '';
  if (!results.length) {
    container.innerHTML = '<div class="glass-card" style="padding:1rem;color:var(--muted)">Search YouTube videos without an API key.</div>';
    return;
  }

  results.forEach((video) => {
    const article = document.createElement('article');
    article.className = 'search-result';
    article.innerHTML = `
      <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
      <div class="search-meta">
        <strong>${video.title}</strong>
        <span class="muted">${video.channel}</span>
        <span class="muted">${video.duration} • ${video.views}</span>
      </div>
      <button class="glow-btn primary small">Add</button>
    `;
    article.querySelector('button').addEventListener('click', () => onAdd(video));
    container.appendChild(article);
  });
}

export function renderAutocomplete(container, suggestions, onPick) {
  container.innerHTML = '';
  suggestions.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'autocomplete-item';
    button.textContent = item;
    button.addEventListener('click', () => onPick(item));
    container.appendChild(button);
  });
}

export function renderSeats(container, room, selfSocketId, onSeatClick, onUserClick) {
  container.innerHTML = '';
  room.seats.forEach((socketId, index) => {
    const occupant = room.users.find((user) => user.socketId === socketId);
    const seat = document.createElement('button');
    seat.type = 'button';
    seat.className = `seat-card ${occupant ? 'occupied' : ''} ${room.ownerSocketId === socketId ? 'owner-seat' : ''} ${occupant?.speaking ? 'active-speaker' : ''}`;
    seat.innerHTML = `<span class="seat-index">Seat ${index + 1}</span>`;

    if (!occupant) {
      seat.innerHTML += '<div><strong>Empty seat</strong><div class="muted">Tap to sit down</div></div>';
      seat.addEventListener('click', () => onSeatClick(index, null));
    } else {
      seat.innerHTML += `
        <img class="seat-avatar" src="${occupant.avatar}" alt="${occupant.username}" />
        <strong style="color:${occupant.color}">${occupant.username}</strong>
        <div class="muted">${occupant.socketId === selfSocketId ? 'Tap to leave' : 'Tap for actions'}</div>
        ${room.ownerSocketId === occupant.socketId ? '<span class="seat-badge">👑 Owner</span>' : occupant.mic ? '<span class="seat-badge">🎤 Mic live</span>' : ''}
      `;
      seat.addEventListener('click', () => {
        if (occupant.socketId === selfSocketId) onSeatClick(index, occupant);
        else onUserClick(occupant.socketId);
      });
    }

    container.appendChild(seat);
  });
}

export function spawnSeatReaction(container, emoji) {
  const node = document.createElement('div');
  node.className = 'seat-reaction';
  node.textContent = emoji;
  container.appendChild(node);
  setTimeout(() => node.remove(), 4000);
}

export function spawnVideoReaction(container, emoji) {
  const node = document.createElement('div');
  node.className = 'floating-reaction';
  node.textContent = emoji;
  node.style.left = `${10 + Math.random() * 80}%`;
  node.style.setProperty('--drift', `${-60 + Math.random() * 120}px`);
  container.appendChild(node);
  setTimeout(() => node.remove(), 4000);
}

export function renderReactionBar(container, enabled, onReact) {
  container.innerHTML = '';
  REACTIONS.forEach((emoji) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reaction-btn';
    button.textContent = emoji;
    button.disabled = !enabled;
    button.addEventListener('click', () => onReact(emoji));
    container.appendChild(button);
  });
}

export function renderNowPlaying(titleEl, metaEl, currentItem, playback) {
  titleEl.textContent = currentItem?.title || 'Nothing queued yet';
  if (!currentItem) {
    metaEl.textContent = 'Add a YouTube video to begin.';
    return;
  }
  metaEl.textContent = `${currentItem.channel} • ${currentItem.duration} • ${playback.playing ? 'Playing' : 'Paused'}`;
}

export function renderQueue(container, room, isOwner, onAction) {
  container.innerHTML = '';
  if (!room.queue.length) {
    container.innerHTML = '<div class="glass-card" style="padding:1rem;color:var(--muted)">Queue is empty.</div>';
    return;
  }

  room.queue.forEach((item, index) => {
    const entry = document.createElement('article');
    entry.className = `queue-item ${index === room.currentIndex ? 'current' : ''}`;
    entry.draggable = Boolean(isOwner);
    entry.dataset.index = String(index);
    entry.innerHTML = `
      <img class="queue-thumb" src="${item.thumbnail}" alt="${item.title}" />
      <div class="queue-meta">
        <div>
          ${index === room.currentIndex ? '<span class="queue-badge">▶ Current</span>' : ''}
          <strong>${item.title}</strong>
        </div>
        <span class="muted">${item.channel}</span>
        <span class="muted">${item.duration} • added by ${item.addedBy}</span>
      </div>
      <div class="queue-actions"></div>
    `;

    const actions = entry.querySelector('.queue-actions');
    const playBtn = document.createElement('button');
    playBtn.className = 'pill-btn';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => onAction('play', { index }));
    actions.appendChild(playBtn);

    if (isOwner) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'pill-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => onAction('remove', { queueId: item.queueId }));
      actions.appendChild(removeBtn);

      const moveUp = document.createElement('button');
      moveUp.className = 'pill-btn';
      moveUp.textContent = '↑';
      moveUp.addEventListener('click', () => onAction('move', { fromIndex: index, toIndex: Math.max(0, index - 1) }));
      actions.appendChild(moveUp);

      const moveDown = document.createElement('button');
      moveDown.className = 'pill-btn';
      moveDown.textContent = '↓';
      moveDown.addEventListener('click', () => onAction('move', { fromIndex: index, toIndex: Math.min(room.queue.length - 1, index + 1) }));
      actions.appendChild(moveDown);
    }

    container.appendChild(entry);
  });
}

export function renderUsers(container, room, onUserClick) {
  container.innerHTML = '';
  room.users
    .slice()
    .sort((a, b) => Number(b.socketId === room.ownerSocketId) - Number(a.socketId === room.ownerSocketId) || a.username.localeCompare(b.username))
    .forEach((user) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-main">
          <img class="user-avatar" src="${user.avatar}" alt="${user.username}" />
          <div class="user-meta">
            <strong style="color:${user.color}">${user.username}</strong>
            <span class="muted">${typeof user.seatIndex === 'number' ? `Seat ${user.seatIndex + 1}` : 'Standing'}${user.mic ? ' • Mic live' : ''}</span>
          </div>
        </div>
        <div class="user-actions">
          ${user.socketId === room.ownerSocketId ? '<span class="seat-badge">👑 Owner</span>' : ''}
          ${user.speaking ? '<span class="seat-badge">🔊 Speaking</span>' : ''}
        </div>
      `;
      row.addEventListener('click', () => onUserClick(user.socketId));
      container.appendChild(row);
    });
}

export function renderMessages(container, messages) {
  container.innerHTML = '';
  if (!messages.length) {
    container.innerHTML = '<div class="glass-card" style="padding:1rem;color:var(--muted)">No messages yet. Break the ice.</div>';
    return;
  }
  messages.forEach((message) => {
    const article = document.createElement('article');
    article.className = 'message-bubble';
    article.innerHTML = `
      <div class="message-head">
        <div class="message-user">
          <img class="message-avatar" src="${message.user.avatar}" alt="${message.user.username}" />
          <div>
            <strong style="color:${message.user.color}">${message.user.username}</strong>
            <div class="muted">${relativeTime(message.createdAt)}</div>
          </div>
        </div>
      </div>
    `;
    if (message.text) {
      const text = document.createElement('div');
      text.textContent = message.text;
      article.appendChild(text);
    }
    if (message.image) {
      const img = document.createElement('img');
      img.className = 'message-image';
      img.src = message.image;
      img.alt = 'Shared image';
      article.appendChild(img);
    }
    container.appendChild(article);
  });
  container.scrollTop = container.scrollHeight;
}

export function renderTypingIndicator(container, typingUsers) {
  const names = [...typingUsers.values()];
  if (!names.length) {
    container.textContent = '';
    return;
  }
  container.textContent = `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} typing...`;
}

export function renderDM(titleEl, container, conversation, selfSocketId, otherUser) {
  titleEl.textContent = otherUser ? `with ${otherUser.username}` : 'Conversation';
  container.innerHTML = '';
  if (!conversation?.length) {
    container.innerHTML = '<div class="glass-card" style="padding:1rem;color:var(--muted)">No private messages yet.</div>';
    return;
  }
  conversation.forEach((message) => {
    const mine = message.from.socketId === selfSocketId;
    const article = document.createElement('article');
    article.className = 'dm-bubble';
    article.style.borderColor = mine ? 'rgba(232,255,71,0.26)' : 'rgba(255,255,255,0.08)';
    article.innerHTML = `
      <div class="dm-head">
        <strong style="color:${mine ? message.from.color : message.from.color}">${mine ? 'You' : message.from.username}</strong>
        <span class="muted">${relativeTime(message.createdAt)}</span>
      </div>
    `;
    if (message.text) {
      const text = document.createElement('div');
      text.textContent = message.text;
      article.appendChild(text);
    }
    if (message.image) {
      const img = document.createElement('img');
      img.className = 'dm-image';
      img.src = message.image;
      img.alt = 'Direct message image';
      article.appendChild(img);
    }
    container.appendChild(article);
  });
  container.scrollTop = container.scrollHeight;
}

export function renderPlayerTime(currentLabel, durationLabel, seekBar, currentTime, duration) {
  currentLabel.textContent = formatTime(currentTime);
  durationLabel.textContent = formatTime(duration);
  if (duration > 0) {
    seekBar.value = String(Math.min(1000, Math.max(0, Math.floor((currentTime / duration) * 1000))));
  }
}

export function renderUserModal(container, user, isSelf, isOwner, roomOwnerSocketId) {
  container.innerHTML = `
    <div style="display:grid;gap:1rem;">
      <div style="display:flex;gap:1rem;align-items:center;">
        <img class="user-avatar" src="${user.avatar}" alt="${user.username}" />
        <div>
          <p class="eyebrow">USER ACTIONS</p>
          <h3 style="color:${user.color}">${user.username}</h3>
          <p class="muted">${typeof user.seatIndex === 'number' ? `Seat ${user.seatIndex + 1}` : 'Standing'}${roomOwnerSocketId === user.socketId ? ' • Owner' : ''}</p>
        </div>
      </div>
      <div class="modal-actions" id="userModalActions"></div>
    </div>
  `;
  const actions = container.querySelector('#userModalActions');
  const buttons = [];

  buttons.push({ action: 'dm', label: 'Message privately' });
  if (isSelf && typeof user.seatIndex === 'number') buttons.push({ action: 'leave-seat', label: 'Leave my seat' });
  if (isOwner && !isSelf) {
    if (typeof user.seatIndex === 'number') buttons.push({ action: 'remove-seat', label: 'Remove from seat' });
    buttons.push({ action: 'transfer-owner', label: 'Transfer ownership' });
    buttons.push({ action: 'kick', label: 'Kick user' });
  }
  buttons.push({ action: 'close', label: 'Close' });

  buttons.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `glow-btn ${entry.action === 'close' ? 'secondary' : entry.action === 'kick' ? 'secondary' : 'primary'}`;
    button.dataset.action = entry.action;
    button.textContent = entry.label;
    actions.appendChild(button);
  });
}
