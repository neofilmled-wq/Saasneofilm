'use client';

import type { ReactNode } from 'react';
import { DeviceProvider } from './device-provider';

export function Providers({ children }: { children: ReactNode }) {
  return <DeviceProvider>{children}</DeviceProvider>;
}
