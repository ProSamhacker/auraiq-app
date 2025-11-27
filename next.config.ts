// next.config.ts

import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  // 1. ADD THIS HEADERS FUNCTION
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: "/:path*",
        headers: [
          {
            // Allows this site to be embedded on ANY domain (including localhost)
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
          {
            // Older browser support for allowing embedding
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
        ],
      },
    ];
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
});

export default withPWA(nextConfig);