'use client';

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(_partnerOrgId?: string): Socket {
  if (socket) return socket;

  // The server derives the partner org from the verified JWT — we only send the token.
  const token = typeof window !== 'undefined' ? localStorage.getItem('neofilm_partner_token') : null;
  socket = io(SOCKET_URL, {
    path: '/ws/partner',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export type ScreenEvent = {
  screenId: string;
  status: 'online' | 'offline' | 'degraded' | 'error';
  timestamp: string;
  deviceId?: string;
};

export type AlertEvent = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  screenId: string;
  message: string;
  createdAt: string;
};

export type PayoutEvent = {
  id: string;
  status: string;
  amountCents: number;
};

export type ConfigAppliedEvent = {
  screenId: string;
  deviceId: string;
  configVersion: string;
  appliedAt: string;
};
