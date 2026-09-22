import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false, // ne pas exposer "X-Powered-By: Next.js" (fingerprinting)
  transpilePackages: ['@neofilm/shared'],
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  allowedDevOrigins: ['http://10.0.2.2:3006', 'http://10.0.3.2:3006'],
};

export default nextConfig;
