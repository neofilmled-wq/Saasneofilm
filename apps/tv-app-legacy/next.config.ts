import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@neofilm/shared', 'dashjs', 'hls.js'],
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ['http://10.0.2.2:3005', 'http://10.0.3.2:3005'],
  experimental: {
    // Force SWC to transpile for older browsers
    swcMinify: true,
  },
};

export default nextConfig;
