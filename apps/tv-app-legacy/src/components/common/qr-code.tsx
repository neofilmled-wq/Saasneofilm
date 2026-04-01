'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  data: string;
  size?: number;
}

export function QRCodeDisplay({ data, size = 300 }: QRCodeDisplayProps) {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(data, {
      width: size,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
      errorCorrectionLevel: 'M',
    }).then(setSrc);
  }, [data, size]);

  if (!src) return <div style={{ width: size, height: size }} className="bg-muted/20 rounded-lg animate-pulse" />;

  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
