import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // This verifies the user is logged in.
    // For true security, you'd also check if these URLs belong to this user.
    await adminAuth.verifyIdToken(authToken);

    // 2. Proceed with deletion
    const { urls } = await request.json();
    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json({ error: 'URLs must be an array.' }, { status: 400 });
    }

    await del(urls);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error deleting files:", error);
    if ((error as Error).message.includes('token')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete files.' }, { status: 500 });
  }
}
