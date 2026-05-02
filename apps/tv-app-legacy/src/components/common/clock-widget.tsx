'use client';

import { useEffect, useState } from 'react';

export function ClockWidget() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    };
    update();
    // Display only shows minutes — refresh every 30s instead of every second
    // to avoid waking the renderer 60× per minute on Android TV.
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, []);

  return <span className="tabular-nums font-medium">{time}</span>;
}
