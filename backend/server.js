const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { port, frontendDir, rootDir } = require('./config/env');
const { applySecurity } = require('./middleware/security');
const youtubeRoutes = require('./routes/youtube');
const { initSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e6,
  cors: { origin: true, methods: ['GET', 'POST'] }
});

applySecurity(app);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api/youtube', youtubeRoutes);
app.use('/shared', express.static(path.join(rootDir, 'shared')));
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.use('/css', express.static(path.join(frontendDir, 'css')));
app.use('/js', express.static(path.join(frontendDir, 'js')));

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(frontendDir, 'room.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

initSocket(io);

server.listen(port, () => {
  console.log(`FACTOR'S CHAT listening on http://localhost:${port}`);
});
