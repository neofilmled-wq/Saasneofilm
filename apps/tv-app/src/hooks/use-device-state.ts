'use client';

import { useCallback, useState } from 'react';
import { DeviceState, canTransition } from '@/lib/state-machine';

export function useDeviceState(initial: DeviceState = DeviceState.UNPAIRED) {
  const [state, setState] = useState<DeviceState>(initial);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const transition = useCallback(
    (to: DeviceState, error?: string) => {
      setState((current) => {
        if (!canTransition(current, to)) {
          console.warn(`Invalid transition: ${current} → ${to}`);
          return current;
        }
        return to;
      });
      if (to === DeviceState.ERROR && error) {
        setErrorMessage(error);
      } else if (to !== DeviceState.ERROR) {
        setErrorMessage(null);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState(DeviceState.UNPAIRED);
    setErrorMessage(null);
  }, []);

  return { state, errorMessage, transition, reset };
}
