// next.config.ts

import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  // ADD THE HEADERS FUNCTION HERE
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            // FIX: We change 'require-corp' to 'credentialless' 
            // This satisfies FFmpeg while allowing the uncooperative AuraIQ iframe to load.
            value: 'credentialless', 
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