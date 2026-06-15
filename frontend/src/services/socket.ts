import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      // Envia o JWT no handshake — o backend valida e só deixa ouvir a própria sala
      auth: (cb) => cb({ token: localStorage.getItem('token') || '' }),
    })
  }
  return socket
}

export function connectSocket(userId: string): void {
  const s = getSocket()
  if (!s.connected) {
    s.connect()
    s.emit('join', userId)
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}
