import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false, // ne pas exposer "X-Powered-By: Next.js" (fingerprinting)
  output: 'standalone',
  transpilePackages: ['@neofilm/ui', '@neofilm/shared'],
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
