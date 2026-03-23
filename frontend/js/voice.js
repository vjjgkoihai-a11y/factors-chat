export class VoiceManager {
  constructor(socket, onStatusChange) {
    this.socket = socket;
    this.onStatusChange = onStatusChange;
    this.localStream = null;
    this.peerConnections = new Map();
    this.audioElements = new Map();
    this.speakingInterval = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.joined = false;
  }

  async join() {
    if (this.joined) return;
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.joined = true;
    this.startSpeakingDetection();
    this.socket.emit('voice:join');
    this.onStatusChange?.(true);
  }

  async leave() {
    if (!this.joined) return;
    this.socket.emit('voice:leave');
    this.joined = false;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.stopSpeakingDetection();
    [...this.peerConnections.keys()].forEach((socketId) => this.cleanupPeer(socketId));
    this.onStatusChange?.(false);
  }

  async connectTo(socketId) {
    if (!this.joined || !this.localStream || this.peerConnections.has(socketId)) return;
    const pc = this.createPeer(socketId);
    this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    this.socket.emit('webrtc:offer', { targetSocketId: socketId, sdp: offer });
  }

  createPeer(socketId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice', { targetSocketId: socketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let audio = this.audioElements.get(socketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        document.body.appendChild(audio);
        this.audioElements.set(socketId, audio);
      }
      audio.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
        this.cleanupPeer(socketId);
      }
    };

    this.peerConnections.set(socketId, pc);
    return pc;
  }

  async handleParticipants(participants) {
    for (const participant of participants) {
      await this.connectTo(participant.socketId);
    }
  }

  async handleOffer(fromSocketId, sdp) {
    if (!this.joined) return;
    let pc = this.peerConnections.get(fromSocketId);
    if (!pc) pc = this.createPeer(fromSocketId);
    this.localStream.getTracks().forEach((track) => {
      const exists = pc.getSenders().some((sender) => sender.track?.id === track.id);
      if (!exists) pc.addTrack(track, this.localStream);
    });
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('webrtc:answer', { targetSocketId: fromSocketId, sdp: answer });
  }

  async handleAnswer(fromSocketId, sdp) {
    const pc = this.peerConnections.get(fromSocketId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async handleIce(fromSocketId, candidate) {
    const pc = this.peerConnections.get(fromSocketId);
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // ignore late ICE candidates for closed connections
    }
  }

  cleanupPeer(socketId) {
    const pc = this.peerConnections.get(socketId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      this.peerConnections.delete(socketId);
    }
    const audio = this.audioElements.get(socketId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.audioElements.delete(socketId);
    }
  }

  startSpeakingDetection() {
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    source.connect(this.analyser);

    let lastState = false;
    this.speakingInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(this.dataArray);
      const average = this.dataArray.reduce((sum, value) => sum + value, 0) / this.dataArray.length;
      const speaking = average > 18;
      if (speaking !== lastState) {
        lastState = speaking;
        this.socket.emit('voice:speaking', { speaking });
      }
    }, 350);
  }

  stopSpeakingDetection() {
    clearInterval(this.speakingInterval);
    this.speakingInterval = null;
    this.socket.emit('voice:speaking', { speaking: false });
    this.audioContext?.close();
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
  }
}
