import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@neofilm/ui', '@neofilm/shared'],
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  allowedDevOrigins: ['http://10.0.2.2:3004', 'http://10.0.3.2:3004'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
