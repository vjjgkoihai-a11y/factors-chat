export function connectSocket() {
  return io({ transports: ['websocket', 'polling'] });
}
