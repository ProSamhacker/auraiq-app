import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Allow iframe embedding
  response.headers.delete('x-frame-options');
  response.headers.set('Content-Security-Policy', "frame-ancestors *;");

  // IMPORTANT: Do NOT set Cross-Origin-Opener-Policy headers
  // Firebase Auth requires popup communication via window.closed
  // Setting COOP would block Firebase popup authentication

  // Allow cross-origin requests
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
}

// Apply this to all routes
export const config = {
  matcher: '/:path*',
};