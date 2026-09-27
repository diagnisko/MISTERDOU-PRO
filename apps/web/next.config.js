import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
  images: {
    // Médias offres : bucket public Cloudflare R2
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
    ],
  },
};

export default nextConfig;
