import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 1. Forcefully delete the blocking header
  response.headers.delete('x-frame-options');

  // 2. Explicitly allow embedding on ANY site
  response.headers.set('Content-Security-Policy', "frame-ancestors *;");
  
  // 3. (Optional) Set Access-Control for good measure
  response.headers.set('Access-Control-Allow-Origin', '*');

  return response;
}

// Apply this to all routes
export const config = {
  matcher: '/:path*',
};