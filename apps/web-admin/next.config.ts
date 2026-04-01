import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@neofilm/ui', '@neofilm/shared'],
};

export default nextConfig;
