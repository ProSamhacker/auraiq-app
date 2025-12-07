// src/app/api/log-error/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

interface ErrorLog {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  userAgent: string;
  url?: string;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse error data
    const errorData: ErrorLog = await request.json();

    // Validate error data
    if (!errorData.message || !errorData.timestamp) {
      return NextResponse.json(
        { error: 'Invalid error data' },
        { status: 400 }
      );
    }

    // Try to get user ID if authenticated
    let userId: string | undefined;
    const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    
    if (authToken) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(authToken);
        userId = decodedToken.uid;
      } catch {
        // Anonymous error log
      }
    }

    // Log to Firestore
    await adminDb.collection('errorLogs').add({
      ...errorData,
      userId: userId || 'anonymous',
      serverTimestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      headers: {
        'user-agent': request.headers.get('user-agent'),
        'referer': request.headers.get('referer'),
      }
    });

    // In production, also send to external error tracking service
    if (process.env.NODE_ENV === 'production' && process.env.ERROR_LOGGING_ENDPOINT) {
      try {
        await fetch(process.env.ERROR_LOGGING_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...errorData,
            userId,
            environment: 'production',
          }),
        });
      } catch (e) {
        console.error('Failed to send to external error service:', e);
      }
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Client Error:', {
        message: errorData.message,
        stack: errorData.stack,
        userId,
      });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error logging failed:', error);
    return NextResponse.json(
      { error: 'Failed to log error' },
      { status: 500 }
    );
  }
}