# FACTOR'S CHAT

FACTOR'S CHAT is a production-ready real-time watch party web application built with Node.js, Express, Socket.IO, vanilla JavaScript, and WebRTC audio.

## Features

- No-login profile onboarding with localStorage persistence
- 10-seat synchronized room layout with owner controls
- Real-time emoji reactions and toast notifications
- YouTube search without API keys via ytInitialData scraping
- Shared synchronized playback using the YouTube IFrame API and Socket.IO
- Public room chat with image upload, typing indicators, and message history
- Private direct messages with image support
- Peer-to-peer audio-only voice chat using WebRTC
- Queue management, room locking, session bans, and automatic ownership transfer
- Responsive glassmorphism dark UI with neon accents

## Run locally

```bash
npm install
npm start
```

Then open:

- http://localhost:3000/

## Project structure

```text
factors-chat/
├── backend/
├── frontend/
├── shared/
├── .env
├── .gitignore
├── README.md
└── package.json
```

## Notes

- Room state is stored in memory for speed and simplicity.
- Voice chat uses browser WebRTC support and requires microphone permissions.
- YouTube search relies on public web responses rather than the official API.
# V2
