import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false, // ne pas exposer "X-Powered-By: Next.js" (fingerprinting)
  output: 'standalone',
  transpilePackages: ['@neofilm/ui', '@neofilm/shared'],
};

export default nextConfig;
