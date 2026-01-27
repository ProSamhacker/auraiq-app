import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user
    const authToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!authToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decodedToken = await adminAuth.verifyIdToken(authToken);
    const userId = decodedToken.uid;

    // 2. Parse the request (now JSON with pre-uploaded file URL)
    const body = await request.json();
    const { fileName, fileUrl } = body;

    if (!fileName || !fileUrl) {
      return NextResponse.json({ error: 'Missing fileName or fileUrl' }, { status: 400 });
    }

    // 3. Save the file metadata to Firestore
    const fileRef = adminDb.collection('users').doc(userId).collection('contextFiles').doc();
    await fileRef.set({
      name: fileName,
      url: fileUrl,
      userId: userId,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, fileId: fileRef.id });

  } catch (error) {
    console.error('Context file metadata save error:', error);
    if ((error as Error).message.includes('token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}