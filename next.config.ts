import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const nextConfig: NextConfig = {
  // Removed Cross-Origin headers that block Firebase popup authentication
  // Firebase requires popup windows to communicate via window.closed and postMessage
  // Setting COOP or COEP headers prevents this communication

  // If you need these headers for other features in the future,
  // you'll need to configure them per-route to exclude auth pages
};

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
});

export default withPWA(nextConfig);