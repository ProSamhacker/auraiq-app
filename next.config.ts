// next.config.ts

import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  // Your regular Next.js config options can go here
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development', // Disable PWA in dev mode
  register: true,
  // The invalid 'skipWaiting' option has been removed
});

export default withPWA(nextConfig);