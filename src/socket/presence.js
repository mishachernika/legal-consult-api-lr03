// Онлайн-статус користувачів у пам'яті процесу: userId → множина socket.id
// (з кількома інстансами сервера статус роз'їжджається — тоді Redis-адаптер/БД)
const connections = new Map();

export function addConnection(userId, socketId) {
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(socketId);
}

export function removeConnection(userId, socketId) {
  const set = connections.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    connections.delete(userId);
    return true; // користувач став офлайн
  }
  return false;
}

export const isOnline = (userId) => connections.has(userId);

export function onlineUserIds() {
  return [...connections.keys()];
}
